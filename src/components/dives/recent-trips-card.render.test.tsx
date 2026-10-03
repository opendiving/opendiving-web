import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecentTripsCard } from "./recent-trips-card";
import type { Trip } from "@/lib/api/trips";
import { giveFramesASize } from "@/test/frame-size";
import { reveal } from "@/test/intersection";

// Each row names its own controls, shows a map of every trip - the world for
// one with no place on it - and deletes where it stands. Two trips
// on purpose: a control named from a constant passes a one-row test exactly as
// well as one named from the trip.

vi.mock("@/lib/api/trips", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/trips")>()),
  tripsAPI: { getTrips: vi.fn(), deleteTrip: vi.fn() },
}));

vi.mock("@/components/layout/quick-create", () => ({
  useQuickCreate: () => vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

vi.mock("@/components/ui/use-toast", () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

vi.mock("@/hooks/useInstanceConfig", () => ({
  useInstanceConfig: () => ({ config: { map_tiles: true }, isLoading: false }),
}));

// The tiles' bytes; what matters here is which rows ask for them, of what.
const { getMapTile } = vi.hoisted(() => ({ getMapTile: vi.fn() }));
vi.mock("@/lib/api/map-tiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/map-tiles")>()),
  mapTilesAPI: { getMapTile },
}));

// jsdom implements neither, and lays nothing out: each row's map is given a
// card's frame.
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
let restoreSize: () => void;
beforeEach(() => {
  let created = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++created}`);
  URL.revokeObjectURL = vi.fn();
  restoreSize = giveFramesASize({ width: 400, height: 236 });
  getMapTile.mockResolvedValue(new Blob(["webp"]));
});
afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  restoreSize();
});

// The form is covered where it lives, and its pickers would make requests of
// their own here; what matters is which trip it was opened for.
vi.mock("@/components/trips/trip-dialog", () => ({
  TripDialog: ({ open, trip }: { open: boolean; trip?: Trip | null }) =>
    open ? <div role="dialog">Editing {trip?.name}</div> : null,
}));

const { tripsAPI } = await import("@/lib/api/trips");

const trip = (overrides: Partial<Trip>): Trip => ({
  uuid: "trip-1",
  name: "Dahab 2026",
  parts: [],
  people: [],
  notes: "",
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  dive_count: 0,
  dive_site_count: 0,
  species_count: 0,
  max_depth: null,
  ...overrides,
});

const MAPPED = trip({
  uuid: "trip-1",
  name: "Dahab 2026",
  parts: [
    {
      location: { name: "Dahab, Egypt", latitude: 28.5, longitude: 34.5 },
      start_date: "2026-04-02",
      end_date: "2026-04-17",
    },
  ],
});

// A place typed in by hand has a name and no position, so its card's map is
// of the whole world rather than the place.
const TYPED = trip({
  uuid: "trip-2",
  name: "Koh Tao 2025",
  parts: [{ location: { name: "Koh Tao" } }],
});

const rowOf = (name: string) =>
  screen
    .getAllByRole("listitem")
    .find((row) => within(row).queryByRole("link", { name }))!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tripsAPI.getTrips).mockResolvedValue({
    data: [MAPPED, TYPED],
    total_count: 2,
    has_more: false,
    page: 1,
    items_per_page: 5,
  });
  vi.mocked(tripsAPI.deleteTrip).mockResolvedValue({ message: "Trip deleted" });
});

describe("RecentTripsCard", () => {
  it("shows a map of every trip, the world for one with no place on it", async () => {
    render(<RecentTripsCard />);
    await screen.findByRole("link", { name: "Dahab 2026" });
    await act(async () => reveal());

    expect(
      await within(rowOf("Dahab 2026")).findByRole("img", {
        name: "Map of Dahab, Egypt",
      }),
    ).toBeInTheDocument();
    expect(
      await within(rowOf("Koh Tao 2025")).findByRole("img", {
        name: "Map of the world, awaiting the places of Koh Tao 2025",
      }),
    ).toBeInTheDocument();
    // In the page's theme: the place at the zoom a lone place opens at, and
    // the world's one tile.
    const urls = getMapTile.mock.calls.map(([url]) => url as string);
    expect(urls).toContain("/map-tiles/dark/0/0/0");
    expect(
      urls.filter((url) => url.startsWith("/map-tiles/dark/9/")),
    ).not.toEqual([]);
  });

  it("counts a trip's dives, dive sites and species", async () => {
    vi.mocked(tripsAPI.getTrips).mockResolvedValue({
      data: [
        {
          ...MAPPED,
          dive_count: 12,
          dive_site_count: 1,
          species_count: 23,
          max_depth: 31.4,
        },
        // No dives yet still shows the counts, at zero, but not the species.
        TYPED,
      ],
      total_count: 2,
      has_more: false,
      page: 1,
      items_per_page: 5,
    });
    render(<RecentTripsCard />);
    await screen.findByRole("link", { name: "Dahab 2026" });

    // Each figure under its own title, as a definition list pairs them.
    const countsOf = (name: string) =>
      Array.from(rowOf(name).querySelectorAll("dt"), (term) => [
        term.textContent,
        term.nextElementSibling?.textContent,
      ]);
    expect(countsOf("Dahab 2026")).toEqual([
      ["Dives", "12"],
      ["Dive sites", "1"],
      ["Species seen", "23"],
    ]);
    expect(countsOf("Koh Tao 2025")).toEqual([
      ["Dives", "0"],
      ["Dive sites", "0"],
    ]);
  });

  it("shows the deepest dive in place of species none of them saw", async () => {
    vi.mocked(tripsAPI.getTrips).mockResolvedValue({
      data: [
        { ...MAPPED, dive_count: 3, dive_site_count: 2, max_depth: 31.4 },
        // Dives with no depth recorded on any of them.
        { ...TYPED, dive_count: 1, dive_site_count: 1, max_depth: null },
      ],
      total_count: 2,
      has_more: false,
      page: 1,
      items_per_page: 5,
    });
    render(<RecentTripsCard />);
    await screen.findByRole("link", { name: "Dahab 2026" });

    const figuresOf = (name: string) =>
      Array.from(rowOf(name).querySelectorAll("dt"), (term) => [
        term.textContent,
        term.nextElementSibling?.textContent,
      ]);
    expect(figuresOf("Dahab 2026")).toEqual([
      ["Dives", "3"],
      ["Dive sites", "2"],
      ["Max depth", "31 m"],
    ]);
    expect(figuresOf("Koh Tao 2025")).toEqual([
      ["Dives", "1"],
      ["Dive sites", "1"],
    ]);
  });

  it("joins the dates and the place with a dot, and drops it when one is missing", async () => {
    vi.mocked(tripsAPI.getTrips).mockResolvedValue({
      data: [MAPPED, TYPED],
      total_count: 2,
      has_more: false,
      page: 1,
      items_per_page: 5,
    });
    render(<RecentTripsCard />);
    await screen.findByRole("link", { name: "Dahab 2026" });

    expect(rowOf("Dahab 2026")).toHaveTextContent(
      /Apr 2 - Apr 17, 2026 · Dahab, Egypt/,
    );
    expect(rowOf("Koh Tao 2025")).toHaveTextContent("Koh Tao");
    expect(rowOf("Koh Tao 2025")).not.toHaveTextContent("·");
  });

  // A card off screen asks for nothing, and /trips holds every trip.
  it("waits for a card to near the screen before drawing its map", async () => {
    render(<RecentTripsCard />);
    await screen.findByRole("link", { name: "Dahab 2026" });

    expect(getMapTile).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    await act(async () => reveal());
    expect(await screen.findAllByRole("img")).toHaveLength(2);
  });

  it("names each row's menu after its trip", async () => {
    render(<RecentTripsCard />);
    await screen.findByRole("link", { name: "Dahab 2026" });

    for (const name of ["Dahab 2026", "Koh Tao 2025"]) {
      expect(
        screen.getByRole("button", { name: `Actions for ${name}` }),
      ).toBeInTheDocument();
    }
  });

  it("edits the trip whose menu it was chosen from", async () => {
    render(<RecentTripsCard />);
    await screen.findByRole("link", { name: "Dahab 2026" });

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Koh Tao 2025" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit" }),
    );

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Editing Koh Tao 2025",
    );
  });

  // The card is the latest five, so a delete reads it again: the sixth trip
  // takes the freed place, and a delete that moved its dives shows the new
  // counts on the trip they went to.
  it("reads the list again after a delete", async () => {
    render(<RecentTripsCard />);
    await screen.findByRole("link", { name: "Dahab 2026" });
    const palau = trip({ uuid: "trip-3", name: "Palau 2024" });
    vi.mocked(tripsAPI.getTrips).mockResolvedValue({
      data: [MAPPED, palau],
      total_count: 2,
      has_more: false,
      page: 1,
      items_per_page: 5,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Koh Tao 2025" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    expect(tripsAPI.deleteTrip).toHaveBeenCalledWith("trip-2", undefined);
    expect(
      await screen.findByRole("link", { name: "Palau 2024" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Koh Tao 2025" })).toBeNull();
  });

  it("holds the cards' place with placeholders while it loads", () => {
    vi.mocked(tripsAPI.getTrips).mockReturnValue(new Promise(() => {}));
    render(<RecentTripsCard />);

    const list = screen.getByRole("list");
    expect(list).toHaveAttribute("aria-busy", "true");
    expect(list.querySelectorAll("li[aria-hidden]")).toHaveLength(5);
  });
});
