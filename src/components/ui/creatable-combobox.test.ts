import { describe, it, expect } from "vitest";
import {
  ComboboxItem,
  clampActiveIndex,
  commitAction,
  emptyMenuLabel,
  menuQuery,
  nextActiveIndex,
  searchDelayMs,
  visibleItems,
} from "./creatable-combobox";

const SITES: ComboboxItem[] = [
  { id: "a", name: "Blue Hole", hint: "Dahab, Egypt" },
  { id: "b", name: "The Bells", hint: "Dahab, Egypt" },
  { id: "c", name: "Elphinstone Reef", hint: "Marsa Alam, Egypt" },
];

describe("nextActiveIndex", () => {
  it("enters the list from the top on Down and the bottom on Up", () => {
    // -1 is "nothing highlighted", the state the menu opens in.
    expect(nextActiveIndex(-1, 1, 5)).toBe(0);
    expect(nextActiveIndex(-1, -1, 5)).toBe(4);
  });

  it("steps through the list", () => {
    expect(nextActiveIndex(0, 1, 5)).toBe(1);
    expect(nextActiveIndex(3, 1, 5)).toBe(4);
    expect(nextActiveIndex(3, -1, 5)).toBe(2);
  });

  it("clamps at both ends rather than wrapping", () => {
    // Running off a long list and silently reappearing at the other end is
    // disorienting, so the highlight parks instead.
    expect(nextActiveIndex(4, 1, 5)).toBe(4);
    expect(nextActiveIndex(0, -1, 5)).toBe(0);
  });

  it("has nothing to highlight in an empty list", () => {
    // e.g. a filter that matches no items - Enter should then fall back to
    // committing the typed text, which -1 signals.
    expect(nextActiveIndex(-1, 1, 0)).toBe(-1);
    expect(nextActiveIndex(2, 1, 0)).toBe(-1);
  });

  it("handles a single option", () => {
    expect(nextActiveIndex(-1, 1, 1)).toBe(0);
    expect(nextActiveIndex(0, 1, 1)).toBe(0);
    expect(nextActiveIndex(0, -1, 1)).toBe(0);
  });

  it("recovers from an index left over from a longer list", () => {
    // Typing re-filters the options; the component resets the highlight, but
    // the maths must not return an out-of-range index even if it didn't.
    expect(nextActiveIndex(9, 1, 3)).toBe(2);
    expect(nextActiveIndex(9, -1, 3)).toBe(2);
  });
});

describe("searchDelayMs", () => {
  it("coalesces keystrokes into one request", () => {
    expect(searchDelayMs("dah")).toBeGreaterThan(0);
  });

  it("fires the menu's opening query straight away", () => {
    // There was no keystroke to wait for, and a delay here is visible as the
    // list not appearing when you click the field.
    expect(searchDelayMs("")).toBe(0);
  });

  it("takes a caller's own debounce", () => {
    // The trip location picker searches through the geocoding proxy, which is
    // rate-limited across the whole instance - it waits longer on purpose.
    expect(searchDelayMs("moal", 450)).toBe(450);
  });

  it("still opens the menu straight away with a longer debounce", () => {
    // The override must not creep into the one query that has nothing to
    // coalesce, or the slower picker gets a slower-appearing menu too.
    expect(searchDelayMs("", 450)).toBe(0);
  });
});

describe("menuQuery", () => {
  it("is nothing while the text is a selection the component wrote", () => {
    // The bug this exists for: with the trip already chosen, the input holds
    // "Dahab 2025", and searching for that returned the one trip already
    // selected - so changing it meant clearing the field first.
    expect(menuQuery({ text: "Dahab 2025", typed: false })).toBe("");
  });

  it("is the typed text once the diver types", () => {
    expect(menuQuery({ text: "dah", typed: true })).toBe("dah");
  });

  it("trims what it hands on", () => {
    // Every consumer compares it against a trimmed `searchedQuery`/`failedQuery`,
    // so a stray space would read as an unanswered query for as long as it stood.
    expect(menuQuery({ text: "  dah  ", typed: true })).toBe("dah");
  });

  it("is nothing for an emptied field either way", () => {
    // Backspacing to nothing is still "typed", and asks for the same unfiltered
    // list the menu opens on.
    expect(menuQuery({ text: "", typed: true })).toBe("");
    expect(menuQuery({ text: "   ", typed: true })).toBe("");
    expect(menuQuery({ text: "", typed: false })).toBe("");
  });

  it("opens the whole list for text that matches nothing, unless it was typed", () => {
    // `typed` is about *who wrote the text*, not about whether it looks like a
    // name - a selection whose item has been renamed elsewhere still opens whole.
    expect(menuQuery({ text: "Zqxwv", typed: false })).toBe("");
    expect(menuQuery({ text: "Zqxwv", typed: true })).toBe("Zqxwv");
  });
});

describe("visibleItems", () => {
  it("filters by name locally when the caller supplied the whole list", () => {
    const result = visibleItems({
      items: SITES,
      query: "blue",
      alreadyFiltered: false,
    });

    expect(result.map((item) => item.id)).toEqual(["a"]);
  });

  it("keeps server matches the local filter would have thrown away", () => {
    // "dahab" appears in the location, not the name. Re-filtering on the name
    // would empty a menu the server had just filled correctly - the exact bug
    // that makes searching a secondary field pointless.
    const fromServer = [SITES[0], SITES[1]];

    const result = visibleItems({
      items: fromServer,
      query: "dahab",
      alreadyFiltered: true,
    });

    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("hides ids that are already picked, in either mode", () => {
    for (const alreadyFiltered of [true, false]) {
      const result = visibleItems({
        items: SITES,
        query: "",
        alreadyFiltered,
        excludeIds: ["a", "c"],
      });

      expect(result.map((item) => item.id)).toEqual(["b"]);
    }
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const result = visibleItems({
      items: SITES,
      query: "  ELPHIN ",
      alreadyFiltered: false,
    });

    expect(result.map((item) => item.id)).toEqual(["c"]);
  });

  it("shows everything when nothing is typed and nothing is excluded", () => {
    expect(
      visibleItems({ items: SITES, query: "", alreadyFiltered: false }),
    ).toHaveLength(3);
  });
});

describe("clampActiveIndex", () => {
  it("leaves an index that still points at a row alone", () => {
    expect(clampActiveIndex(2, 5)).toBe(2);
    expect(clampActiveIndex(4, 5)).toBe(4);
    expect(clampActiveIndex(-1, 5)).toBe(-1);
  });

  it("drops the highlight when the list shrinks under it", () => {
    // A debounced remote search narrowing from 5 matches to 2 while the user holds
    // ArrowDown. Enter then read `filteredItems[3]` - undefined - and threw.
    expect(clampActiveIndex(3, 2)).toBe(-1);
    expect(clampActiveIndex(0, 0)).toBe(-1);
  });

  it("collapses to nothing-highlighted rather than to the last row", () => {
    // Clamping to `count - 1` would silently move the highlight onto an unrelated
    // option, and Enter would pick it. -1 makes Enter commit the typed text instead.
    expect(clampActiveIndex(9, 3)).toBe(-1);
  });
});

describe("emptyMenuLabel", () => {
  const base = {
    query: "",
    minSearchLength: 1,
    maxSearchLength: Infinity,
    searchFailed: false,
    isBusy: false,
    noItemsLabel: "No dive sites yet.",
    noMatchesLabel: "No dive sites match.",
    searchErrorLabel: "Search is unavailable right now.",
  };

  it("says it is searching while there is no answer yet", () => {
    // Including the debounce, which `isSearching` alone misses - the menu used
    // to spend that window claiming nothing matched.
    expect(emptyMenuLabel({ ...base, query: "dahab", isBusy: true })).toBe(
      "Searching...",
    );
  });

  it("keeps the empty open-query as a real search", () => {
    // The regression this exists to stop: every remote field but the place
    // picker fills its initial list with a search for "", so short-circuiting
    // on "shorter than the minimum" announced "No dive sites yet." for the
    // whole round trip - and hid the failure if it failed.
    expect(emptyMenuLabel({ ...base, isBusy: true })).toBe("Searching...");
    expect(emptyMenuLabel({ ...base, searchFailed: true })).toBe(
      base.searchErrorLabel,
    );
    expect(emptyMenuLabel(base)).toBe(base.noItemsLabel);
  });

  it("does not report on a query outside what the search accepts", () => {
    const picker = {
      ...base,
      minSearchLength: 2,
      maxSearchLength: 200,
      noItemsLabel: "Type to search places.",
      noMatchesLabel: "No places found.",
    };

    expect(emptyMenuLabel({ ...picker, query: "m", isBusy: true })).toBe(
      "Type to search places.",
    );
    // Opposite advice at the opposite end: "type to search" is nonsense with a
    // pasted paragraph sitting in the field.
    expect(
      emptyMenuLabel({
        ...picker,
        query: "m".repeat(201),
        queryTooLongLabel: "Too long to search.",
      }),
    ).toBe("Too long to search.");
    expect(emptyMenuLabel({ ...picker, query: "m".repeat(201) })).toBe(
      "Type to search places.",
    );
    expect(emptyMenuLabel({ ...picker, query: "mo" })).toBe("No places found.");
  });

  it("prefers a failure over a stale no-matches", () => {
    expect(
      emptyMenuLabel({ ...base, query: "dahab", searchFailed: true }),
    ).toBe(base.searchErrorLabel);
  });

  it("falls back to the no-items text when a field has no no-matches text", () => {
    expect(
      emptyMenuLabel({ ...base, query: "dahab", noMatchesLabel: undefined }),
    ).toBe(base.noItemsLabel);
  });
});

describe("commitAction", () => {
  const base = {
    availableItems: SITES,
    isRemote: false,
    searchedQuery: null,
    canCreate: false,
  };

  it("clears on empty or whitespace-only text", () => {
    expect(commitAction({ ...base, text: "" })).toEqual({ type: "clear" });
    expect(commitAction({ ...base, text: "   " })).toEqual({ type: "clear" });
  });

  it("selects an exact match, case- and whitespace-insensitively", () => {
    expect(commitAction({ ...base, text: "  blue hole " })).toEqual({
      type: "select",
      item: SITES[0],
    });
  });

  it("creates unmatched text when there is an inline creator", () => {
    expect(
      commitAction({ ...base, text: "Shark Bay", canCreate: true }),
    ).toEqual({ type: "create", name: "Shark Bay" });
  });

  it("clears unmatched text when there is no inline creator", () => {
    expect(commitAction({ ...base, text: "Shark Bay" })).toEqual({
      type: "clear",
    });
  });

  describe("in remote mode, before the server has answered", () => {
    // The reported bug: tab into the Trip field on /dives/new and straight back out.
    // The menu opens, the debounced search is still pending, `availableItems` is
    // empty - and the dive saved with no trip.
    const remote = {
      availableItems: [],
      isRemote: true,
      searchedQuery: null,
      canCreate: false,
    };

    it("keeps the selection when no search has resolved yet", () => {
      expect(
        commitAction({
          ...remote,
          text: "Red Sea 2026",
          selectedName: "Red Sea 2026",
        }),
      ).toEqual({ type: "keep" });
    });

    it("keeps the selection even with nothing selected to compare against", () => {
      // An in-flight search is not evidence about anything, selection or not.
      expect(commitAction({ ...remote, text: "Red Sea 2026" })).toEqual({
        type: "keep",
      });
    });

    it("keeps the selection when the resolved query is a different one", () => {
      // Results for "red" say nothing about whether "Red Sea 2026" exists.
      expect(
        commitAction({ ...remote, text: "Red Sea 2026", searchedQuery: "red" }),
      ).toEqual({ type: "keep" });
    });

    it("creates from an unanswered query only where the field appends", () => {
      // The trip location picker's outage hatch. Refusing protects a loaded
      // value from a network blip, and an append-only field has none - what it
      // has instead is a diver whose geocoder is down and who can otherwise add
      // no location at all. The caller opts in; nobody else's behaviour moves.
      expect(
        commitAction({
          ...remote,
          text: "Zqxwv House Reef",
          canCreate: true,
          createWithoutSearch: true,
        }),
      ).toEqual({ type: "create", name: "Zqxwv House Reef" });

      expect(
        commitAction({
          ...remote,
          text: "Zqxwv House Reef",
          canCreate: true,
        }),
      ).toEqual({ type: "keep" });

      // Opting in without an inline creator changes nothing: there is nothing
      // to create with.
      expect(
        commitAction({
          ...remote,
          text: "Zqxwv House Reef",
          createWithoutSearch: true,
        }),
      ).toEqual({ type: "keep" });
    });

    it("never re-creates the value it already holds", () => {
      // The opt-in above lets an unanswered query become a new item, and a
      // single-select that takes it carries a loaded value the append-only
      // fields do not. Focusing one fires the empty-query search, which the
      // geocode client answers `[]` locally - so a bare Enter arrives here
      // unanswered, with the text still the selected name. Creating from that
      // rebuilds a geocoded place as a bare name and drops its coordinates.
      expect(
        commitAction({
          ...remote,
          text: "Dahab",
          selectedName: "Dahab",
          canCreate: true,
          createWithoutSearch: true,
          searchedQuery: "",
        }),
      ).toEqual({ type: "keep" });
    });

    it("clears once the server has answered this exact query with nothing", () => {
      // The guard must not become "never clear in remote mode" - deleting the text
      // and typing a name that really doesn't exist still has to take effect.
      expect(
        commitAction({
          ...remote,
          text: "Nowhere",
          searchedQuery: "Nowhere",
        }),
      ).toEqual({ type: "clear" });
    });
  });

  it("keeps a selection whose name the input still shows", () => {
    // Nothing was edited, so there is nothing to commit. Guards the case where the
    // selected item has dropped out of the current results entirely.
    expect(
      commitAction({
        ...base,
        text: "Red Sea 2026",
        availableItems: [],
        selectedName: "Red Sea 2026",
      }),
    ).toEqual({ type: "keep" });
  });

  it("still prefers a real match over the selected name", () => {
    expect(
      commitAction({ ...base, text: "The Bells", selectedName: "The Bells" }),
    ).toEqual({ type: "select", item: SITES[1] });
  });
});
