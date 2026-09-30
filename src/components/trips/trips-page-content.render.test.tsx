import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripsPageContent } from "./trips-page-content";
import type { Trip } from "@/lib/api/trips";

// A trip deleted with its dives moved onto another changes that other trip's
// card - it counts them now - so the list is read again; a plain delete drops
// its own card and leaves the rest where the diver scrolled them.

const stable = vi.hoisted(() => ({
  guard: { user: { uuid: "user-1" }, isAuthenticated: true, isLoading: false },
}));

vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => stable.guard,
}));

vi.mock("@/components/ui/use-toast", () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

// Covered where they live, and each would make requests of its own here.
vi.mock("@/components/map/locations-map-lazy", () => ({
  LocationsMap: () => null,
}));
vi.mock("@/components/trips/trip-dialog", () => ({
  TripDialog: () => null,
}));

vi.mock("@/lib/api/trips", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/trips")>()),
  tripsAPI: { getTrips: vi.fn(), deleteTrip: vi.fn() },
}));

const { tripsAPI } = await import("@/lib/api/trips");

const trip = (uuid: string, name: string, dives: number): Trip => ({
  uuid,
  name,
  parts: [],
  people: [],
  notes: "",
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  dive_count: dives,
  dive_site_count: 0,
  species_count: 0,
});

const DAHAB = trip("trip-1", "Dahab 2026", 12);
const CEBU = trip("trip-2", "Cebu 2026", 8);

// What the list holds, answered to the list's own reads; the delete dialog's
// picker searches the same endpoint with a term, and is offered Cebu.
let listed: Trip[] = [];
const page = (data: Trip[]) => ({
  data,
  total_count: data.length,
  has_more: false,
  page: 1,
  items_per_page: 10,
});

const countsOf = (name: string) => {
  const card = screen
    .getAllByRole("listitem")
    .find((item) => within(item).queryByRole("link", { name }))!;
  return card.querySelector("dd")!.textContent;
};

const deleteDahab = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: "Actions for Dahab 2026" }),
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Delete" }),
  );
  return screen.findByRole("dialog");
};

beforeEach(() => {
  vi.clearAllMocks();
  listed = [DAHAB, CEBU];
  vi.mocked(tripsAPI.getTrips).mockImplementation(
    async (_page, _size, search) =>
      page(search === undefined ? listed : [CEBU]),
  );
  vi.mocked(tripsAPI.deleteTrip).mockResolvedValue({ message: "Trip deleted" });
});

describe("TripsPageContent", () => {
  it("reads the list again when a delete moves the trip's dives", async () => {
    render(<TripsPageContent />);
    await screen.findByRole("link", { name: "Dahab 2026" });
    expect(countsOf("Cebu 2026")).toBe("8");

    const dialog = await deleteDahab();
    await userEvent.click(within(dialog).getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: /Cebu/ }));
    listed = [{ ...CEBU, dive_count: 20 }];
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    expect(tripsAPI.deleteTrip).toHaveBeenCalledWith("trip-1", "trip-2");
    await screen.findByText("20");
    expect(countsOf("Cebu 2026")).toBe("20");
    expect(screen.queryByRole("link", { name: "Dahab 2026" })).toBeNull();
  });

  it("drops only the deleted card when nothing moved", async () => {
    render(<TripsPageContent />);
    await screen.findByRole("link", { name: "Dahab 2026" });
    const reads = vi
      .mocked(tripsAPI.getTrips)
      .mock.calls.filter(([, , search]) => search === undefined).length;

    const dialog = await deleteDahab();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    expect(tripsAPI.deleteTrip).toHaveBeenCalledWith("trip-1", undefined);
    await screen.findByRole("link", { name: "Cebu 2026" });
    expect(screen.queryByRole("link", { name: "Dahab 2026" })).toBeNull();
    expect(
      vi
        .mocked(tripsAPI.getTrips)
        .mock.calls.filter(([, , search]) => search === undefined),
    ).toHaveLength(reads);
  });
});
