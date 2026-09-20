import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripDialog } from "./trip-dialog";

// The parts field and the map are tested next door and in `components/map/`.
// What only this render reaches is the arrangement of the form itself: the
// order the fields are asked in, and that the map is part of the dialog rather
// than something that appears once a place has been picked.

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
  // The trip's own date row is gone: a part carries its own dates, so the only
  // dates in this dialog are inside the rows the Parts field holds. The map
  // under that field answers the search in it, so the two belong together.
  it("asks for the name, then the parts, then the notes", () => {
    renderDialog();

    const labels = Array.from(document.querySelectorAll("label")).map((label) =>
      label.textContent?.trim(),
    );

    expect(labels).toEqual(["Name *", "Parts", "Notes"]);
  });

  it("asks for a part's dates on the part, not on the trip", async () => {
    // The assertion above passes for a dialog with no way to date anything at
    // all, which is the shape this change could most easily have shipped.
    renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Add a part" }));

    const labels = Array.from(document.querySelectorAll("label")).map((label) =>
      label.textContent?.trim(),
    );
    expect(labels).toEqual([
      "Name *",
      "Parts",
      "From part 1 of 1",
      "To part 1 of 1",
      "Notes",
    ]);
  });

  // The whole of the error path, through the resolver rather than around it:
  // the schema reports a reversed range at `parts.1.end_date`, which makes
  // react-hook-form's `errors.parts` an array with no message of its own. A
  // `FormMessage` over the list renders that as the word "undefined" and
  // refuses the save with nothing a diver can act on.
  it("says which part's dates are the wrong way round", async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText("Name *"), "Egypt, spring");
    await userEvent.click(screen.getByRole("button", { name: "Add a part" }));
    await userEvent.click(screen.getByRole("button", { name: "Add a part" }));

    await userEvent.click(screen.getByLabelText("From part 2 of 2"));
    await userEvent.paste("2026-04-22");
    await userEvent.click(screen.getByLabelText("To part 2 of 2"));
    await userEvent.paste("2026-04-18");
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));

    expect(
      await screen.findByText("End date must be on or after start date"),
    ).toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
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

  // The map sits under the parts, not over them: the diver searched for a name,
  // and the map answers "yes, that is the place you meant".
  it("puts the map below the parts and above the notes", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Add a part" }));

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
