import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripDialog } from "./trip-dialog";

// The picker and the map are tested next door and in `components/map/`. What
// only this render reaches is the arrangement of the form itself: the order the
// fields are asked in, and that the map is part of the dialog rather than
// something that appears once a place has been picked.

vi.mock("@/lib/api/trips", () => ({
  tripsAPI: { createTrip: vi.fn(), updateTrip: vi.fn() },
}));

vi.mock("@/lib/api/geocoding", () => ({
  geocodingAPI: { searchPlaces: vi.fn().mockResolvedValue([]) },
  MIN_PLACE_QUERY_LENGTH: 2,
  MAX_PLACE_QUERY_LENGTH: 200,
}));

// The real map is behind `next/dynamic`, which renders its skeleton and nothing
// else in a test environment - so there would be no way to tell "the map is
// there" from "the map was gated out". This stands in for it and reports what
// it was asked for.
vi.mock("@/components/map/locations-map-lazy", () => ({
  LocationsMap: ({ showWhenEmpty }: { showWhenEmpty?: boolean }) => (
    <div data-testid="locations-map" data-show-when-empty={!!showWhenEmpty} />
  ),
}));

function renderDialog() {
  return render(<TripDialog open onOpenChange={() => {}} onSaved={() => {}} />);
}

describe("TripDialog", () => {
  // The dates come first because they are what a diver knows without thinking;
  // the place is picked from a search, and the map under it is the answer to
  // that search, so the two belong together below them.
  it("asks for the name, then the dates, then the place", () => {
    renderDialog();

    const labels = Array.from(document.querySelectorAll("label")).map((label) =>
      label.textContent?.trim(),
    );

    expect(labels).toEqual([
      "Name *",
      "Start date *",
      "End date",
      "Location",
      "Notes",
    ]);
  });

  it("shows the map before any place has been picked", () => {
    // A frame that arrived with the first place would shove everything under it
    // down the dialog mid-edit.
    renderDialog();

    expect(screen.getByTestId("locations-map")).toHaveAttribute(
      "data-show-when-empty",
      "true",
    );
  });

  // The map sits under the picker, not over it: the diver searched for a name,
  // and the map answers "yes, that is the place you meant".
  it("puts the map below the place picker and above the notes", () => {
    renderDialog();

    const map = screen.getByTestId("locations-map");
    const picker = screen.getByRole("combobox");
    const notes = screen.getByLabelText("Notes");

    expect(picker.compareDocumentPosition(map)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(map.compareDocumentPosition(notes)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
