import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import TripDetailPage from "./page";
import type { Trip } from "@/lib/api/trips";
import type { Dive } from "@/lib/api/dives";
import type { Contact } from "@/lib/api/contacts";
import type { Person } from "@/lib/api/people";

// What only a render reaches on this page is where the contacts and the people
// land: each part's accommodation under its place, the "Dive centers" line the page
// derives from the trip's dives rather than reading off the trip, and the people
// the trip itself records. The derivation's order is `distinctContactUuids`',
// tested beside it.

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
}));

vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => stable.guard,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => stable.router,
  useParams: () => stable.params,
}));

vi.mock("@/components/ui/use-toast", () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

// The dives card and the map are covered where they live, and each would make
// requests of its own here.
vi.mock("@/components/dives/recent-dives-card", () => ({
  RecentDivesCard: () => null,
}));
vi.mock("@/components/map/locations-map-lazy", () => ({
  LocationsMap: () => null,
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
  fetchAllPeople: vi.fn(),
}));

const { tripsAPI } = await import("@/lib/api/trips");
const { divesAPI } = await import("@/lib/api/dives");
const { fetchAllContacts } = await import("@/lib/api/contacts");
const { fetchAllPeople } = await import("@/lib/api/people");

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
    { location: { name: "Dahab" }, accommodation_uuid: "coral" },
    { location: { name: "Sharm" } },
  ],
  people: [
    { person_uuid: "sam", role: "companion" },
    { person_uuid: "alex", role: null },
  ],
  notes: "",
  user_uuid: "user-1",
  created_at: "2026-04-01T09:00:00Z",
};

const dive = (uuid: string, contact_uuid: string | null) =>
  ({ uuid, contact_uuid }) as Dive;

beforeEach(() => {
  vi.clearAllMocks();
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
  vi.mocked(fetchAllPeople).mockResolvedValue([
    person("alex", "Alex M.", "alexm"),
    person("sam", "Sam"),
  ]);
});

describe("TripDetailPage", () => {
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
    expect(divesAPI.getDives).toHaveBeenCalledWith(1, 100, "trip-1");
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
    expect(screen.getByRole("link", { name: "Sam" })).toHaveAttribute(
      "href",
      "/people/sam",
    );
  });
});
