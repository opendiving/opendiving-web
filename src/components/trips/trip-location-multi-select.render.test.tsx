import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripLocationMultiSelect } from "./trip-location-multi-select";
import type { TripLocationFormValue } from "@/lib/validations/trip";
import { MAX_TRIP_LOCATIONS } from "@/lib/validations/trip";

// The mapping helpers are unit-tested next door. What only a render reaches is
// the list itself: what the rows are identified by, and the two ceilings the
// form's schema would otherwise enforce far too late to be useful.

vi.mock("@/lib/api/geocoding", () => ({
  geocodingAPI: { searchPlaces: vi.fn().mockResolvedValue([]) },
  // The real value, since the picker hands it to the combobox as the length
  // below which "no places found" would be a claim about nothing.
  MIN_PLACE_QUERY_LENGTH: 2,
  MAX_PLACE_QUERY_LENGTH: 200,
}));

const { geocodingAPI } = await import("@/lib/api/geocoding");
const searchPlaces = vi.mocked(geocodingAPI.searchPlaces);

beforeEach(() => {
  searchPlaces.mockClear();
  searchPlaces.mockResolvedValue([]);
});

// The field is controlled, and every one of these asserts on what it does to
// its own value - so the test holds the state the form would.
function Field({ initial = [] }: { initial?: TripLocationFormValue[] }) {
  const [value, setValue] = useState<TripLocationFormValue[]>(initial);
  return <TripLocationMultiSelect value={value} onChange={setValue} />;
}

const rows = () =>
  Array.from(document.querySelectorAll("li")).map((li) =>
    li.textContent?.trim(),
  );

describe("TripLocationMultiSelect", () => {
  it("removes only the row whose X was clicked, duplicates included", async () => {
    // The API allows a trip to hold the same place twice, so a saved trip can
    // arrive holding it even though this picker never creates one. Rows keyed by
    // content would remove as a pair.
    render(
      <Field
        initial={[{ name: "Bohol" }, { name: "Bohol" }, { name: "Moalboal" }]}
      />,
    );

    await userEvent.click(
      screen.getAllByRole("button", { name: /^Remove / })[0],
    );

    expect(rows()).toEqual([
      "Bohol - not on the map",
      "Moalboal - not on the map",
    ]);
  });

  it("does not name a place twice in one row", () => {
    // Nominatim's label opens with the name it matched, so the row's own name
    // and the label after it read "Dahab, Dahab, South Sinai, 45214, Egypt" -
    // the trim is what `formatLocationContext` is for, and this is where a
    // reader would meet it. The `title` carries the same text, since that is
    // what an ellipsis hides.
    render(
      <Field
        initial={[
          {
            name: "Dahab",
            display_name: "Dahab, South Sinai, 45214, Egypt",
            latitude: 28.4954,
            longitude: 34.5197,
          },
        ]}
      />,
    );

    expect(rows()).toEqual(["Dahab, South Sinai, 45214, Egypt"]);
    expect(screen.getByTitle("Dahab, South Sinai, 45214, Egypt")).toBeVisible();
  });

  it("shows a label that repeats the name and nothing else as the name alone", () => {
    // And still not as "not on the map" - the place has a position, the label
    // simply had nothing to add.
    render(
      <Field
        initial={[
          {
            name: "Bohol",
            display_name: "Bohol",
            latitude: 9.85,
            longitude: 124.14,
          },
        ]}
      />,
    );

    expect(rows()).toEqual(["Bohol"]);
  });

  it("renders the credit's licence link rather than its markdown", async () => {
    // The API folds the licence URL into the credit as a markdown link. Printed
    // rather than rendered, a diver reads "[Data © OpenStreetMap contributors,
    // ODbL 1.0.](https://osm.org/copyright)" under the field.
    searchPlaces.mockResolvedValue([
      {
        latitude: 28.4954,
        longitude: 34.5197,
        location: "Dahab, Egypt",
        display_name: "Dahab, South Sinai, 45214, Egypt",
        name: "Dahab",
        attribution:
          "[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)",
      },
    ]);
    render(<Field />);

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
    searchPlaces.mockResolvedValue([
      {
        latitude: 28.4954,
        longitude: 34.5197,
        location: "Dahab, Egypt",
        display_name: "Dahab, South Sinai, 45214, Egypt",
        name: "Dahab",
        attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
      },
    ]);
    const { container } = render(<Field />);
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

  it("truncates a typed name to what the API will take", async () => {
    // Without this the row is added and the *form* refuses to save, reporting an
    // error under a field that renders it as the word "undefined".
    render(<Field />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("a".repeat(300));
    // Enter only creates once the search behind *this* query has answered, so
    // the wait is the debounce plus the round trip. Waiting on the menu's "no
    // places found" would prove nothing: that label is chosen from the typed
    // text, so it is on screen from the first keystroke.
    await waitFor(
      () => expect(searchPlaces).toHaveBeenCalledWith("a".repeat(300)),
      { timeout: 2000 },
    );
    await waitFor(() => expect(searchPlaces).toHaveResolved());
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toBe(`${"a".repeat(255)} - not on the map`);
    // And says it did, rather than quietly handing back a shorter name than the
    // one that was typed.
    expect(screen.getByRole("status")).toHaveTextContent(
      "Shortened to 255 characters.",
    );
  });

  it("adds typed text on Enter, and does nothing at all on leaving the field", async () => {
    // The near-miss this guards: type "phil", see Philippines in the menu, click
    // Save instead of the row. Committing on blur would file a place called
    // "phil" in the same gesture that closed the dialog. Nothing is committed on
    // the way out - not even the exact-match select. The results below hold a
    // place named exactly what was typed, which is also the shape that used to
    // append a row from the keystroke alone, before either gesture.
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
        <Field />
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
    expect(rows()).toEqual([]);

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

    await waitFor(() => expect(rows()).toEqual(["phil - not on the map"]));
  });

  it("adds typed text on Enter before the search has answered", async () => {
    // A diver typing a place they know is not in any gazetteer presses Enter
    // well inside the 450 ms debounce. The blur that Enter triggers cancels the
    // pending search, so waiting for an answer that is never coming would mean
    // dropping the text and clearing the field with nothing said about it.
    render(<Field />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("Uncle Bob's House Reef");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(rows()).toEqual(["Uncle Bob's House Reef - not on the map"]),
    );
  });

  it("keeps the keyboard on the row it is moving", async () => {
    // Rows are keyed by position, so React reuses the handle in place rather
    // than moving it with its row: without the focus following the move, a
    // second press would push the *neighbour* back and the row could never
    // travel more than one step.
    render(
      <Field
        initial={[
          { name: "Moalboal" },
          { name: "Bohol" },
          { name: "Malapascua" },
        ]}
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
      expect(rows()).toEqual([
        "Bohol - not on the map",
        "Malapascua - not on the map",
        "Moalboal - not on the map",
      ]),
    );
  });

  it("does not call one character a search that found nothing", async () => {
    // `searchPlaces` answers a one-character query `[]` locally, because the
    // endpoint's `q` starts at two - so "No places found" would be a report on
    // a search that never ran. The invitation to keep typing stands instead.
    render(<Field />);

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
    // the whole 450 ms before the request even goes out, since `isSearching`
    // only rises once the timer fires. A diver typing "Bohol" briskly and
    // pressing Enter took that invitation and got a name-only row for a place
    // the geocoder knows - one that never reaches the map.
    render(<Field />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("Bohol");

    expect(screen.getByText("Searching...")).toBeInTheDocument();
    expect(screen.queryByText(/No places found/)).not.toBeInTheDocument();

    await waitFor(
      () => expect(screen.getByText(/No places found/)).toBeInTheDocument(),
      { timeout: 2000 },
    );
  });

  it("is ready for the next place as soon as one is added", async () => {
    // A picked row leaves the menu open with the cursor in the field. A typed
    // one arrives by a longer road - Enter blurs to commit - and has to put
    // both back, or adding two places in a row needs a click in between.
    render(<Field />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("Uncle Bobs House Reef");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // And a second Enter, pressed out of habit on the now-empty field, has to
    // leave it that way rather than closing the menu and dropping focus.
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("combobox")),
    );
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
  });

  it("says so when the place typed is already in the list", async () => {
    // The combobox clears the input on its way through, so a refusal that says
    // nothing looks exactly like the field having eaten the text.
    render(<Field initial={[{ name: "The Boat" }]} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("the boat");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "the boat is already in the list.",
      ),
    );
    expect(rows()).toEqual(["The Boat - not on the map"]);
  });

  it("stops reporting a failed search once the query moves on", async () => {
    // A failure belongs to the query it was asked for. Held as a bare flag, the
    // outage message would still be on screen while the diver typed the next
    // place - and Enter would file that one as name-only text on the strength of
    // a failure that was never about it.
    // Keyed on the query rather than the call, since the menu opening fires an
    // empty-query search of its own before a single character is typed.
    searchPlaces.mockImplementation(async (query) => {
      if (query === "moalboal") throw new Error("429");
      return [];
    });
    render(<Field />);

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

  it("gives the real reason when a pasted name is both too long and a duplicate", async () => {
    // Two things to say and only one line to say them in: the truncation is
    // beside the point if the place never went in.
    const long = "a".repeat(300);
    render(<Field initial={[{ name: "a".repeat(255) }]} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste(long);
    await waitFor(() => expect(searchPlaces).toHaveBeenLastCalledWith(long));
    await waitFor(() => expect(searchPlaces).toHaveResolved());
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "is already in the list.",
      ),
    );
    expect(rows()).toHaveLength(1);
  });

  it("clears the duplicate notice once the row it named is gone", async () => {
    render(<Field initial={[{ name: "The Boat" }, { name: "The Pier" }]} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("The Boat");
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "The Boat is already in the list.",
      ),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Remove The Boat" }),
    );

    // The region stays mounted - it has to, to be announced next time - and
    // empties instead.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("hands the keyboard somewhere when the last slot is filled", async () => {
    // Filling the list disables the search input, and a browser blurs what it
    // disables - so the combobox's own refocus lands on `<body>` and Tab
    // restarts at the top of the dialog. Removing a row is the only thing left
    // to do here.
    const nearlyFull = Array.from(
      { length: MAX_TRIP_LOCATIONS - 1 },
      (_, index) => ({ name: `Place ${index + 1}` }),
    );
    render(<Field initial={nearlyFull} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("Last One");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Remove Last One" }),
      ),
    );
  });

  it("closes the field at the cap rather than dropping picks in silence", async () => {
    const full = Array.from({ length: MAX_TRIP_LOCATIONS }, (_, index) => ({
      name: `Place ${index + 1}`,
    }));
    render(<Field initial={full} />);

    const input = screen.getByRole("combobox");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute(
      "placeholder",
      `${MAX_TRIP_LOCATIONS} locations maximum - remove one to add another`,
    );

    // And it reopens as soon as there is room, since a trip that arrived over
    // the cap still has to be editable back down.
    await userEvent.click(
      screen.getAllByRole("button", { name: /^Remove / })[0],
    );

    expect(screen.getByRole("combobox")).toBeEnabled();
  });
});
