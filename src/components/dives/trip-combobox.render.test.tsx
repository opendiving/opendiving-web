import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripCombobox } from "./trip-combobox";

vi.mock("@/lib/api/trips", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/trips")>()),
  tripsAPI: { lookupTrips: vi.fn(), getTrip: vi.fn() },
}));

const { tripsAPI } = await import("@/lib/api/trips");
const lookupTrips = vi.mocked(tripsAPI.lookupTrips);

const page = <T,>(items: T[]) => ({
  data: items,
  total_count: items.length,
  has_more: false,
  page: 1,
  items_per_page: 25,
});

beforeEach(() => {
  vi.clearAllMocks();
  lookupTrips.mockResolvedValue(
    page([
      { uuid: "trip-2", name: "Dahab 2019" },
      { uuid: "trip-1", name: "Cebu 2026" },
    ]),
  );
});

describe("TripCombobox", () => {
  it("lists the lookup's rows in the order it ranked them at the record's date", async () => {
    render(
      <TripCombobox
        aria-label="Trip"
        onChange={() => {}}
        until="2019-06-01T09:00:00+02:00"
      />,
    );

    await userEvent.click(screen.getByRole("combobox"));

    await screen.findByRole("option", { name: "Dahab 2019" });
    expect(lookupTrips).toHaveBeenCalledWith(1, 25, {
      search: "",
      until: "2019-06-01T09:00:00+02:00",
    });
    expect(
      screen
        .getAllByRole("option")
        .map((option) => option.textContent)
        .filter((text) => text !== "Add trip..."),
    ).toEqual(["Dahab 2019", "Cebu 2026"]);
  });

  it("labels a pick from the lookup row, with no read of the trip", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TripCombobox aria-label="Trip" onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Cebu 2026" }),
    );
    expect(onChange).toHaveBeenCalledWith("trip-1");
    rerender(
      <TripCombobox aria-label="Trip" value="trip-1" onChange={onChange} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("combobox")).toHaveValue("Cebu 2026"),
    );
    expect(tripsAPI.getTrip).not.toHaveBeenCalled();
  });
});
