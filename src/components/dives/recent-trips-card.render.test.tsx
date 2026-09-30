import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecentTripsCard } from "./recent-trips-card";
import type { Trip } from "@/lib/api/trips";

// Each row names its own controls, draws a map only for a trip with a place on
// one, and deletes where it stands. Two trips on purpose: a control named from a
// constant passes a one-row test exactly as well as one named from the trip.

vi.mock("@/lib/api/trips", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/trips")>()),
  tripsAPI: { getTrips: vi.fn(), deleteTrip: vi.fn() },
}));

vi.mock("@/components/layout/quick-create", () => ({
  useQuickCreate: () => vi.fn(),
}));

vi.mock("@/components/ui/use-toast", () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

// The map needs WebGL; what matters here is which rows get one.
vi.mock("@/components/map/locations-map-lazy", () => ({
  LocationsMap: ({ subject }: { subject: string }) => (
    <div data-testid="map">{subject}</div>
  ),
}));

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

// A place typed in by hand has a name and no position, so there is nothing to
// draw - and a placeholder that then vanishes would make the list jump.
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
  it("draws a map only for a trip with a place on one", async () => {
    render(<RecentTripsCard />);
    await screen.findByRole("link", { name: "Dahab 2026" });

    expect(screen.getAllByTestId("map")).toHaveLength(1);
    expect(within(rowOf("Dahab 2026")).getByTestId("map")).toBeInTheDocument();
    expect(within(rowOf("Koh Tao 2025")).queryByTestId("map")).toBeNull();
    expect(within(rowOf("Koh Tao 2025")).getByText("Koh Tao")).toBeVisible();
  });

  it("counts a trip's dives, dive sites and species beside its name", async () => {
    vi.mocked(tripsAPI.getTrips).mockResolvedValue({
      data: [
        { ...MAPPED, dive_count: 12, dive_site_count: 1, species_count: 23 },
        // No dives yet, and an API that sends no counts: neither shows a line.
        { ...TYPED, dive_count: 0, dive_site_count: 0, species_count: 0 },
        trip({ uuid: "trip-3", name: "Palau 2024" }),
      ],
      total_count: 3,
      has_more: false,
      page: 1,
      items_per_page: 5,
    });
    render(<RecentTripsCard />);
    await screen.findByRole("link", { name: "Dahab 2026" });

    expect(
      within(rowOf("Dahab 2026")).getByText(
        "12 dives, 1 dive site, 23 species",
      ),
    ).toBeInTheDocument();
    expect(rowOf("Koh Tao 2025")).not.toHaveTextContent("dives");
    expect(rowOf("Palau 2024")).not.toHaveTextContent("dives");
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

  it("deletes a trip from its menu and drops only that row", async () => {
    render(<RecentTripsCard />);
    await screen.findByRole("link", { name: "Dahab 2026" });

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
      await screen.findByRole("link", { name: "Dahab 2026" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Koh Tao 2025" })).toBeNull();
  });
});
