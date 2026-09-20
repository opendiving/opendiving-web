import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripPartsField } from "./trip-parts-field";
import type { TripPartFormValue } from "@/lib/validations/trip";
import { MAX_TRIP_PARTS } from "@/lib/validations/trip";

// The mapping helpers are unit-tested next door. What only a render reaches is
// the list itself: what a part is identified by, what a row can be edited to
// without leaving it, and the ceiling the form's schema would otherwise enforce
// far too late to be useful.

vi.mock("@/lib/api/geocoding", () => ({
  geocodingAPI: { searchPlaces: vi.fn().mockResolvedValue([]) },
  // The real values, since the field hands them to the combobox as the lengths
  // outside which "no places found" would be a claim about nothing.
  MIN_PLACE_QUERY_LENGTH: 2,
  MAX_PLACE_QUERY_LENGTH: 200,
}));

const { geocodingAPI } = await import("@/lib/api/geocoding");
const searchPlaces = vi.mocked(geocodingAPI.searchPlaces);

const DAHAB = {
  latitude: 28.4954,
  longitude: 34.5197,
  location: "Dahab, Egypt",
  display_name: "Dahab, South Sinai, 45214, Egypt",
  name: "Dahab",
  attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
};

beforeEach(() => {
  searchPlaces.mockClear();
  searchPlaces.mockResolvedValue([]);
});

// The field is controlled, and every one of these asserts on what it does to
// its own value - so the test holds the state the form would.
function Field({ initial = [] }: { initial?: TripPartFormValue[] }) {
  const [value, setValue] = useState<TripPartFormValue[]>(initial);
  return <TripPartsField value={value} onChange={setValue} />;
}

const places = () =>
  screen
    .queryAllByRole("combobox")
    .map((input) => (input as HTMLInputElement).value);

const placed = (name: string): TripPartFormValue => ({
  location: { name },
  start_date: "",
  end_date: "",
});

describe("TripPartsField", () => {
  it("says in words that a part need not be a place", () => {
    // The useful half of the new shape is the one nothing on screen suggests.
    render(<Field />);

    expect(screen.getByText(/No parts yet/)).toHaveTextContent(
      /dates and no place/,
    );
  });

  it("adds an empty part in one action and puts the cursor in it", async () => {
    // A new part is empty, so the first thing to do with it is say where or
    // when it was - and the diver should not have to go and find the field.
    render(<Field />);

    await userEvent.click(screen.getByRole("button", { name: "Add a part" }));

    expect(places()).toEqual([""]);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("combobox")),
    );
  });

  it("shows a part's place and both its dates on the row", async () => {
    render(
      <Field
        initial={[
          {
            location: { name: "Dahab", display_name: "Dahab, Egypt" },
            start_date: "2026-04-18",
            end_date: "2026-04-22",
          },
        ]}
      />,
    );

    expect(places()).toEqual(["Dahab"]);
    expect(screen.getByLabelText("From Dahab")).toHaveValue("2026-04-18");
    expect(screen.getByLabelText("To Dahab")).toHaveValue("2026-04-22");
  });

  it("edits a date without leaving the row", async () => {
    render(<Field initial={[placed("Dahab")]} />);

    const from = screen.getByLabelText("From Dahab");
    await userEvent.click(from);
    await userEvent.paste("2026-04-18");
    await userEvent.tab();

    await waitFor(() => expect(from).toHaveValue("2026-04-18"));
  });

  it("names a part with no place by its dates, and one with neither by its ordinal", () => {
    // Every control in the row has to say which stretch of the trip it is for,
    // and a part has no name of its own to say it with.
    render(
      <Field
        initial={[
          { start_date: "2026-04-18", end_date: "2026-04-22" },
          { location: null, start_date: "", end_date: "" },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Remove Apr 18 - Apr 22, 2026" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove part 2" }),
    ).toBeInTheDocument();
  });

  it("removes only the part whose X was clicked, repeats included", async () => {
    // Two parts may name the same place, so rows keyed by content would remove
    // as a pair.
    render(
      <Field initial={[placed("Dahab"), placed("Dahab"), placed("Sharm")]} />,
    );

    await userEvent.click(
      screen.getAllByRole("button", { name: /^Remove / })[0],
    );

    expect(places()).toEqual(["Dahab", "Sharm"]);
  });

  it("offers a place a part already holds to the next part too", async () => {
    // Dahab, then Sharm, then back to Dahab. Hiding an already-picked place
    // from the menu made that trip unrecordable.
    searchPlaces.mockResolvedValue([DAHAB]);
    render(<Field initial={[placed("Dahab"), placed("Sharm")]} />);

    await userEvent.click(screen.getAllByRole("combobox")[1]);
    await userEvent.paste("Dahab");
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith("Dahab"), {
      timeout: 2000,
    });

    expect(
      await screen.findByRole("option", { name: /Dahab/ }),
    ).toBeInTheDocument();
  });

  it("sets the place of the row that was searched in", async () => {
    searchPlaces.mockResolvedValue([DAHAB]);
    render(<Field initial={[placed("Sharm"), { location: null }]} />);

    await userEvent.click(screen.getAllByRole("combobox")[1]);
    await userEvent.paste("Dahab");
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith("Dahab"), {
      timeout: 2000,
    });
    await userEvent.click(await screen.findByRole("option", { name: /Dahab/ }));

    await waitFor(() => expect(places()).toEqual(["Sharm", "Dahab"]));
  });

  it("adds typed text on Enter, and does nothing at all on leaving the field", async () => {
    // The near-miss this guards: type "phil", see Philippines in the menu, click
    // Save instead of the row. Committing on blur would file a place called
    // "phil" in the same gesture that closed the dialog. The results below hold
    // a place named exactly what was typed, which is also the shape that would
    // commit from the keystroke alone if typing chose anything.
    searchPlaces.mockResolvedValue([
      {
        latitude: 37.1,
        longitude: -85.2,
        location: "Phil, United States",
        display_name: "Phil, Casey County, Kentucky, United States",
        name: "phil",
        attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
      },
    ]);
    render(
      <>
        <Field initial={[{ location: null }]} />
        <button type="button">Save</button>
      </>,
    );

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("phil");
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith("phil"), {
      timeout: 2000,
    });
    await waitFor(() => expect(searchPlaces).toHaveResolved());

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.getByRole("button", { name: "Remove part 1" }),
    ).toBeInTheDocument();
    // And the text went with the blur rather than sitting there looking
    // committed.
    expect(places()).toEqual([""]);

    searchPlaces.mockResolvedValue([]);

    // Reopening the menu searches again for the now-empty input, so this waits
    // for the typed query a second time rather than trusting the first answer.
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("phil");
    await waitFor(() => expect(searchPlaces).toHaveBeenLastCalledWith("phil"), {
      timeout: 2000,
    });
    await waitFor(() => expect(searchPlaces).toHaveResolved());
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Remove phil" }),
      ).toBeInTheDocument(),
    );
  });

  it("adds typed text on Enter before the search has answered", async () => {
    // A diver typing a place they know is not in any gazetteer presses Enter
    // well inside the 450 ms debounce. The blur that Enter triggers cancels the
    // pending search, so waiting for an answer that is never coming would mean
    // dropping the text and clearing the field with nothing said about it.
    render(<Field initial={[{ location: null }]} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("Uncle Bob's House Reef");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(places()).toEqual(["Uncle Bob's House Reef"]),
    );
  });

  it("truncates a typed name to what the API will take", async () => {
    // Without this the place is set and the *form* refuses to save, reporting
    // an error under a field that renders it as the word "undefined".
    render(<Field initial={[{ location: null }]} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("a".repeat(300));
    // Enter only creates once the search behind *this* query has answered, so
    // the wait is the debounce plus the round trip.
    await waitFor(
      () => expect(searchPlaces).toHaveBeenCalledWith("a".repeat(300)),
      { timeout: 2000 },
    );
    await waitFor(() => expect(searchPlaces).toHaveResolved());
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(places()).toEqual(["a".repeat(255)]));
    // And says it did, rather than quietly handing back a shorter name than the
    // one that was typed.
    expect(screen.getByRole("status")).toHaveTextContent(
      "Shortened to 255 characters.",
    );
  });

  it("gives a part back its dates-only shape when the place is cleared", async () => {
    render(<Field initial={[placed("Dahab")]} />);

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => expect(places()).toEqual([""]));
    expect(
      screen.getByRole("button", { name: "Remove part 1" }),
    ).toBeInTheDocument();
  });

  it("renders the credit's licence link rather than its markdown", async () => {
    // The API folds the licence URL into the credit as a markdown link. Printed
    // rather than rendered, a diver reads "[Data © OpenStreetMap contributors,
    // ODbL 1.0.](https://osm.org/copyright)" under the field.
    searchPlaces.mockResolvedValue([
      {
        ...DAHAB,
        attribution:
          "[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)",
      },
    ]);
    render(<Field initial={[{ location: null }]} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("Dahab");
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith("Dahab"), {
      timeout: 2000,
    });

    const link = await screen.findByRole("link", {
      name: "Data © OpenStreetMap contributors, ODbL 1.0.",
    });
    expect(link).toHaveAttribute("href", "https://osm.org/copyright");
    expect(screen.queryByText(/\[Data ©/)).not.toBeInTheDocument();
  });

  it("keeps the credit's line reserved before any search has run", async () => {
    // The credit used to appear with the first result, growing the field and
    // shoving the map - and the Notes field under it - down the dialog while
    // the diver was mid-edit. Its line is held open instead, so nothing below
    // it moves. Counted as elements rather than measured, since jsdom lays
    // nothing out: what must not happen is a paragraph arriving.
    searchPlaces.mockResolvedValue([DAHAB]);
    const { container } = render(<Field initial={[{ location: null }]} />);
    const before = container.querySelectorAll("p").length;

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("Dahab");
    await waitFor(
      () =>
        expect(
          screen.getByText(/OpenStreetMap contributors, ODbL/),
        ).toBeInTheDocument(),
      { timeout: 2000 },
    );

    expect(container.querySelectorAll("p").length).toBe(before);
  });

  it("keeps the keyboard on the part it is moving", async () => {
    // Rows are keyed by position, so React reuses the handle in place rather
    // than moving it with its row: without the focus following the move, a
    // second press would push the *neighbour* back and the part could never
    // travel more than one step.
    render(
      <Field
        initial={[placed("Moalboal"), placed("Bohol"), placed("Malapascua")]}
      />,
    );

    screen.getByRole("button", { name: /^Reorder Moalboal/ }).focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("aria-label")).toMatch(
        /^Reorder Moalboal, position 2/,
      ),
    );

    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(places()).toEqual(["Bohol", "Malapascua", "Moalboal"]),
    );
  });

  it("does not call one character a search that found nothing", async () => {
    // `searchPlaces` answers a one-character query `[]` locally, because the
    // endpoint's `q` starts at two - so "No places found" would be a report on
    // a search that never ran. The invitation to keep typing stands instead.
    render(<Field initial={[{ location: null }]} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("m");
    await waitFor(() => expect(searchPlaces).toHaveBeenLastCalledWith("m"));

    expect(screen.getByText("Type to search places.")).toBeInTheDocument();
    expect(screen.queryByText(/No places found/)).not.toBeInTheDocument();

    await userEvent.paste("o");
    await waitFor(
      () => expect(screen.getByText(/No places found/)).toBeInTheDocument(),
      { timeout: 2000 },
    );
  });

  it("says it is searching while the debounce is still running", async () => {
    // The menu used to read "No places found - press Enter to add as text" for
    // the whole 450 ms before the request even goes out. A diver typing "Bohol"
    // briskly and pressing Enter took that invitation and got a name-only place
    // the geocoder knows - one that never reaches the map.
    render(<Field initial={[{ location: null }]} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("Bohol");

    expect(screen.getByText("Searching...")).toBeInTheDocument();
    expect(screen.queryByText(/No places found/)).not.toBeInTheDocument();

    await waitFor(
      () => expect(screen.getByText(/No places found/)).toBeInTheDocument(),
      { timeout: 2000 },
    );
  });

  it("stops reporting a failed search once the query moves on", async () => {
    // A failure belongs to the query it was asked for. Held as a bare flag, the
    // outage message would still be on screen while the diver typed the next
    // place - and Enter would file that one as name-only text on the strength of
    // a failure that was never about it.
    searchPlaces.mockImplementation(async (query) => {
      if (query === "moalboal") throw new Error("429");
      return [];
    });
    render(<Field initial={[{ location: null }]} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("moalboal");
    expect(
      await screen.findByText(/Couldn't reach the place search/, undefined, {
        timeout: 2000,
      }),
    ).toBeInTheDocument();

    await userEvent.clear(screen.getByRole("combobox"));
    await userEvent.paste("bohol");
    expect(
      screen.queryByText(/Couldn't reach the place search/),
    ).not.toBeInTheDocument();
  });

  it("closes the Add button at the cap rather than dropping parts in silence", async () => {
    const full = Array.from({ length: MAX_TRIP_PARTS }, (_, index) =>
      placed(`Place ${index + 1}`),
    );
    render(<Field initial={full} />);

    expect(screen.getByRole("button", { name: "Add a part" })).toBeDisabled();
    expect(
      screen.getByText(`${MAX_TRIP_PARTS} parts maximum - remove one to add another.`),
    ).toBeInTheDocument();

    // And it reopens as soon as there is room, since a trip that arrived over
    // the cap still has to be editable back down.
    await userEvent.click(
      screen.getAllByRole("button", { name: /^Remove / })[0],
    );

    expect(screen.getByRole("button", { name: "Add a part" })).toBeEnabled();
  });
});
