import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TripDetailPage from "./page";
import type { Trip } from "@/lib/api/trips";
import type { Dive } from "@/lib/api/dives";
import type { Contact } from "@/lib/api/contacts";
import type { Person } from "@/lib/api/people";

// What only a render reaches on this page is where the contacts and the people
// land: each part's accommodation under its place, the "Dive centers" line the page
// derives from the trip's dives rather than reading off the trip, and the people
// the trip itself records. The derivation's order is `distinctContactUuids`',
// tested beside it. And the hero over it all: the trip's name as the heading, its
// dates and places, its figures, and what its map is handed - the map itself is
// covered where it lives.

// Returned by identity, for the reason the other page tests give: the effects here
// are keyed on values read off these objects.
const stable = vi.hoisted(() => ({
  guard: {
    user: { uuid: "user-1" },
    isAuthenticated: true,
    isLoading: false,
  },
  router: { push: vi.fn(), replace: vi.fn() },
  params: { id: "trip-1" },
  searchParams: new URLSearchParams(),
}));

vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => stable.guard,
}));

// The hero's depth figure reads the diver's units.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => stable.router,
  useParams: () => stable.params,
  usePathname: () => `/trips/${stable.params.id}`,
  useSearchParams: () => stable.searchParams,
}));

vi.mock("@/components/ui/use-toast", () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

// The dives column and the map are covered where they live, and each would make
// requests of its own here.
vi.mock("@/components/trips/trip-dive-sections", () => ({
  TripDiveSections: () => null,
}));
vi.mock("@/components/map/map-backdrop", () => ({
  MapBackdrop: vi.fn(() => null),
  useMapTiles: () => true,
}));

vi.mock("@/lib/api/trips", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/trips")>()),
  tripsAPI: { getTrip: vi.fn(), deleteTrip: vi.fn() },
}));
vi.mock("@/lib/api/dives", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dives")>()),
  divesAPI: { getDives: vi.fn() },
}));
vi.mock("@/lib/api/contacts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/contacts")>()),
  fetchAllContacts: vi.fn(),
}));
vi.mock("@/lib/api/people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/people")>()),
  peopleAPI: { getPerson: vi.fn() },
}));

const { tripsAPI } = await import("@/lib/api/trips");
const { MapBackdrop } = await import("@/components/map/map-backdrop");
const { divesAPI } = await import("@/lib/api/dives");
const { fetchAllContacts } = await import("@/lib/api/contacts");
const { peopleAPI } = await import("@/lib/api/people");

const contact = (uuid: string, name: string): Contact => ({
  uuid,
  name,
  roles: [],
  notes: "",
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00Z",
});

const person = (
  uuid: string,
  name: string,
  username: string | null = null,
): Person => ({
  uuid,
  name,
  username,
  notes: "",
  dive_count: 0,
  created_at: "2026-01-01T00:00:00Z",
});

const TRIP: Trip = {
  uuid: "trip-1",
  name: "Egypt, spring",
  parts: [
    {
      location: { name: "Dahab", latitude: 28.49, longitude: 34.51 },
      accommodation_uuid: "coral",
      start_date: "2026-04-03",
      end_date: "2026-04-08",
    },
    { location: { name: "Sharm" } },
  ],
  people: [
    { person_uuid: "sam", role: "companion" },
    { person_uuid: "alex", role: null },
  ],
  notes: "",
  user_uuid: "user-1",
  created_at: "2026-04-01T09:00:00Z",
  dive_count: 0,
  dive_site_count: 0,
  species_count: 0,
  max_depth: null,
};

const dive = (uuid: string, contact_uuid: string | null) =>
  ({ uuid, contact_uuid }) as Dive;

beforeEach(() => {
  vi.clearAllMocks();
  stable.searchParams = new URLSearchParams();
  vi.mocked(tripsAPI.getTrip).mockResolvedValue(TRIP);
  // As the trip lists them: newest first, one with no contact, one shop twice.
  vi.mocked(divesAPI.getDives).mockResolvedValue({
    data: [
      dive("d3", "red"),
      dive("d2", null),
      dive("d1", "blue"),
      dive("d0", "red"),
    ],
    total_count: 4,
    has_more: false,
    page: 1,
    items_per_page: 100,
  });
  vi.mocked(fetchAllContacts).mockResolvedValue([
    contact("coral", "Coral Hotel"),
    contact("red", "Red Sea Divers"),
    contact("blue", "Blue Ocean"),
  ]);
  const people = [person("alex", "Alex M.", "alexm"), person("sam", "Sam")];
  vi.mocked(peopleAPI.getPerson).mockImplementation(async (uuid) => {
    const found = people.find((one) => one.uuid === uuid);
    if (!found) throw new Error("404");
    return found;
  });
});

describe("TripDetailPage", () => {
  it("heads the page with the trip's name, dates and places over its figures", async () => {
    vi.mocked(tripsAPI.getTrip).mockResolvedValue({
      ...TRIP,
      dive_count: 12,
      dive_site_count: 5,
      species_count: 3,
      max_depth: 30.4,
    });
    render(<TripDetailPage />);

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Egypt, spring",
    });
    expect(heading).toHaveTextContent("Egypt, spring");
    expect(heading.nextElementSibling).toHaveTextContent(
      "Apr 3 - Apr 8, 2026 · Dahab +1",
    );

    // Every figure the trip has, the depth in whole units.
    const figure = (label: string) =>
      screen.getByText(label).nextElementSibling?.textContent;
    expect(figure("Dives")).toBe("12");
    expect(figure("Dive sites")).toBe("5");
    expect(figure("Species seen")).toBe("3");
    expect(figure("Max depth")).toBe("30 m");
  });

  it("leaves off the species a trip has none of, and a depth it has none of", async () => {
    render(<TripDetailPage />);

    await screen.findByRole("heading", { level: 1, name: "Egypt, spring" });
    expect(screen.getByText("Dives").nextElementSibling).toHaveTextContent("0");
    expect(screen.queryByText("Species seen")).toBeNull();
    expect(screen.queryByText("Max depth")).toBeNull();
  });

  it("hands the hero's map the trip's places, the world where none has a position", async () => {
    render(<TripDetailPage />);

    await screen.findByRole("heading", { level: 1, name: "Egypt, spring" });
    const props = vi.mocked(MapBackdrop).mock.lastCall![0];
    expect(props).toMatchObject({ hero: true, showWhenEmpty: true });
    expect(props.locations.map((location) => location.name)).toEqual([
      "Dahab",
      "Sharm",
    ]);
    // Which the hero credits at its details' foot instead.
    expect(
      screen.getByRole("link", { name: /OpenStreetMap/ }),
    ).toBeInTheDocument();
    // The sidebar's own map is gone: the hero's is the one on the page.
    expect(vi.mocked(MapBackdrop).mock.calls.every(([p]) => p.hero)).toBe(true);
  });

  // Logging a dive is the one on the hero's row, and editing joins deleting
  // under the menu.
  it("keeps every action reachable from the hero's top row", async () => {
    render(<TripDetailPage />);

    await screen.findByRole("heading", { level: 1, name: "Egypt, spring" });
    expect(screen.getByRole("link", { name: "Back to trips" })).toHaveAttribute(
      "href",
      "/trips",
    );
    expect(screen.getByRole("link", { name: "Log a dive" })).toHaveAttribute(
      "href",
      "/dives/new?trip_uuid=trip-1&from=%2Ftrips%2Ftrip-1",
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "Edit" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();
  });

  it("goes back to the page it was opened from", async () => {
    stable.searchParams = new URLSearchParams("from=/dashboard");
    render(<TripDetailPage />);

    await screen.findByRole("heading", { level: 1, name: "Egypt, spring" });
    expect(
      screen.getByRole("link", { name: "Back to dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
  });

  // The dates are on the hero's line, and when it was created is not the trip's.
  it("leaves the trip's dates to the hero", async () => {
    render(<TripDetailPage />);

    await screen.findByRole("heading", { name: "Trip Information" });
    expect(screen.queryByText("Trip dates")).toBeNull();
    expect(screen.queryByText("Created on")).toBeNull();
  });

  it("draws no information card for a trip with nothing more to say", async () => {
    vi.mocked(tripsAPI.getTrip).mockResolvedValue({
      ...TRIP,
      parts: [],
      people: [],
    });
    vi.mocked(divesAPI.getDives).mockResolvedValue({
      data: [],
      total_count: 0,
      has_more: false,
      page: 1,
      items_per_page: 100,
    });
    render(<TripDetailPage />);

    await screen.findByRole("heading", { level: 1, name: "Egypt, spring" });
    expect(
      screen.queryByRole("heading", { name: "Trip Information" }),
    ).toBeNull();
  });

  it("puts a part's accommodation under its place", async () => {
    render(<TripDetailPage />);

    const dahab = (await screen.findByText("Dahab")).closest("li")!;
    expect(await within(dahab).findByText("Coral Hotel")).toBeInTheDocument();
    const sharm = screen.getByText("Sharm").closest("li")!;
    expect(within(sharm).queryByText("Coral Hotel")).toBeNull();
  });

  it("names the dive centers the trip's dives name, each once, in the dives' order", async () => {
    render(<TripDetailPage />);

    const label = await screen.findByText("Dive centers");
    expect(label.nextElementSibling).toHaveTextContent(
      "Red Sea Divers, Blue Ocean",
    );
    // Every dive of the trip, filtered by it - not the page the dives card shows.
    expect(divesAPI.getDives).toHaveBeenCalledWith(1, 100, {
      tripUuid: "trip-1",
    });
  });

  it("leaves the line off a trip whose dives name nobody", async () => {
    vi.mocked(divesAPI.getDives).mockResolvedValue({
      data: [dive("d1", null)],
      total_count: 1,
      has_more: false,
      page: 1,
      items_per_page: 100,
    });
    render(<TripDetailPage />);

    await screen.findByText("Coral Hotel");
    expect(screen.queryByText("Dive centers")).toBeNull();
  });

  it("lists the trip's people in its order, each with their role and username", async () => {
    render(<TripDetailPage />);

    const rows = (await screen.findAllByRole("link", { name: /Sam|Alex/ })).map(
      (link) => link.closest("li")!.textContent,
    );
    expect(rows).toEqual(["SamCompanion", "Alex M. @alexm"]);
    // And back to this trip from theirs.
    expect(screen.getByRole("link", { name: "Sam" })).toHaveAttribute(
      "href",
      "/people/sam?from=%2Ftrips%2Ftrip-1",
    );
  });
});
