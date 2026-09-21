import { describe, expect, it } from "vitest";
import {
  formatTripLocationNames,
  formatTripLocationNamesHint,
} from "./trip-locations";

describe("formatTripLocationNames", () => {
  it("joins every name when no limit is given", () => {
    expect(
      formatTripLocationNames([
        { name: "Moalboal" },
        { name: "Bohol" },
        { name: "Malapascua" },
      ]),
    ).toBe("Moalboal; Bohol; Malapascua");
  });

  it("separates the names with a semicolon, not a comma", () => {
    // A place's own name carries its country now, so a comma join reads as one
    // list of four things rather than two places.
    expect(
      formatTripLocationNames([
        { name: "Dahab, Egypt" },
        { name: "Sharm El Sheikh, Egypt" },
      ]),
    ).toBe("Dahab, Egypt; Sharm El Sheikh, Egypt");
  });

  it("counts the names past the limit rather than dropping them silently", () => {
    expect(
      formatTripLocationNames(
        [
          { name: "Moalboal" },
          { name: "Bohol" },
          { name: "Malapascua" },
          { name: "Siquijor" },
        ],
        { max: 2 },
      ),
    ).toBe("Moalboal; Bohol +2");
  });

  it("adds no suffix when the list exactly fills the limit", () => {
    expect(
      formatTripLocationNames([{ name: "Moalboal" }, { name: "Bohol" }], {
        max: 2,
      }),
    ).toBe("Moalboal; Bohol");
  });

  it("answers undefined for a trip with no locations", () => {
    // Not "" - callers pick their own placeholder, and a table's "-" is not a
    // subtitle's "render nothing".
    expect(formatTripLocationNames([])).toBeUndefined();
    expect(formatTripLocationNames(undefined)).toBeUndefined();
    expect(formatTripLocationNames(null)).toBeUndefined();
  });

  it("drops blank names instead of joining around them", () => {
    expect(
      formatTripLocationNames([
        { name: "Moalboal" },
        { name: "   " },
        { name: "Bohol" },
      ]),
    ).toBe("Moalboal; Bohol");
  });

  it("answers undefined when every name is blank", () => {
    expect(formatTripLocationNames([{ name: "" }])).toBeUndefined();
  });

  it("trims the names it shows", () => {
    expect(formatTripLocationNames([{ name: "  Bohol  " }])).toBe("Bohol");
  });

  it("counts the hidden names after the blank ones are dropped", () => {
    // The "+N" has to match what a diver would count on the trip itself, so it
    // is derived from the usable names, not from the raw array's length.
    expect(
      formatTripLocationNames(
        [{ name: "Moalboal" }, { name: " " }, { name: "Bohol" }],
        { max: 1 },
      ),
    ).toBe("Moalboal +1");
  });
});

describe("formatTripLocationNamesHint", () => {
  it("spells out every name the label compacted away", () => {
    expect(
      formatTripLocationNamesHint(
        [{ name: "Moalboal" }, { name: "Bohol" }, { name: "Malapascua" }],
        { max: 2 },
      ),
    ).toBe("Moalboal; Bohol; Malapascua");
  });

  it("answers undefined when the label already shows them all", () => {
    // Including the case where the list exactly fills the limit, since there is
    // no "+N" on screen to explain.
    expect(
      formatTripLocationNamesHint([{ name: "Moalboal" }, { name: "Bohol" }], {
        max: 2,
      }),
    ).toBeUndefined();
    expect(
      formatTripLocationNamesHint([{ name: "Moalboal" }, { name: "Bohol" }]),
    ).toBeUndefined();
  });

  it("answers undefined for a trip with no usable locations", () => {
    expect(formatTripLocationNamesHint([], { max: 2 })).toBeUndefined();
    expect(formatTripLocationNamesHint(undefined, { max: 2 })).toBeUndefined();
    expect(formatTripLocationNamesHint(null, { max: 2 })).toBeUndefined();
    expect(
      formatTripLocationNamesHint([{ name: "" }, { name: "  " }], { max: 1 }),
    ).toBeUndefined();
  });

  it("ignores blank names when deciding whether anything is hidden", () => {
    // Two usable names under a limit of two is nothing hidden, however many
    // blanks the trip carries between them.
    expect(
      formatTripLocationNamesHint(
        [{ name: "Moalboal" }, { name: " " }, { name: "Bohol" }],
        { max: 2 },
      ),
    ).toBeUndefined();
  });

  it("separates the names it reveals the same way the label does", () => {
    // The hint is read against the label it explains, so a reader comparing the
    // two must not meet two different list conventions.
    expect(
      formatTripLocationNamesHint(
        [{ name: "Dahab, Egypt" }, { name: "Sharm El Sheikh, Egypt" }],
        { max: 1 },
      ),
    ).toBe("Dahab, Egypt; Sharm El Sheikh, Egypt");
  });

  it("trims the names it reveals", () => {
    expect(
      formatTripLocationNamesHint(
        [{ name: "  Moalboal " }, { name: " Bohol" }],
        { max: 1 },
      ),
    ).toBe("Moalboal; Bohol");
  });
});
