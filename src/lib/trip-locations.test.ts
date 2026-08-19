import { describe, expect, it } from "vitest";
import {
  formatLocationContext,
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
    ).toBe("Moalboal, Bohol, Malapascua");
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
    ).toBe("Moalboal, Bohol +2");
  });

  it("adds no suffix when the list exactly fills the limit", () => {
    expect(
      formatTripLocationNames([{ name: "Moalboal" }, { name: "Bohol" }], {
        max: 2,
      }),
    ).toBe("Moalboal, Bohol");
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
    ).toBe("Moalboal, Bohol");
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
    ).toBe("Moalboal, Bohol, Malapascua");
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

  it("trims the names it reveals", () => {
    expect(
      formatTripLocationNamesHint(
        [{ name: "  Moalboal " }, { name: " Bohol" }],
        { max: 1 },
      ),
    ).toBe("Moalboal, Bohol");
  });
});

describe("formatLocationContext", () => {
  it("drops the name the label repeats at the front", () => {
    // The whole point: the row shows the name and then this, and Nominatim's
    // label opens with the name it was matched by.
    expect(
      formatLocationContext({
        name: "Dahab",
        display_name: "Dahab, South Sinai, 45214, Egypt",
      }),
    ).toBe("South Sinai, 45214, Egypt");
    expect(
      formatLocationContext({
        name: "Ko Tao",
        display_name:
          "Ko Tao, Ko Pha-ngan District, Surat Thani Province, Thailand",
      }),
    ).toBe("Ko Pha-ngan District, Surat Thani Province, Thailand");
  });

  it("keeps a repeat that is not at the front", () => {
    // "Dahab" is context for a site called Blue Hole, not a duplicate of it -
    // and it is the context that tells two Blue Holes apart.
    expect(
      formatLocationContext({
        name: "Blue Hole",
        display_name: "Blue Hole, Dahab, South Sinai, Egypt",
      }),
    ).toBe("Dahab, South Sinai, Egypt");
  });

  it("keeps a part the name only prefixes", () => {
    // Matching on the whole part, not on the characters: "Ko Tao" must not eat
    // the front of "Ko Tao Island".
    expect(
      formatLocationContext({
        name: "Ko Tao",
        display_name: "Ko Tao Island, Surat Thani Province, Thailand",
      }),
    ).toBe("Ko Tao Island, Surat Thani Province, Thailand");
  });

  it("answers undefined when the label says no more than the name", () => {
    // So the caller drops the element rather than rendering an empty one.
    expect(
      formatLocationContext({ name: "Bohol", display_name: "Bohol" }),
    ).toBeUndefined();
    expect(
      formatLocationContext({ name: "Bohol", display_name: " bohol " }),
    ).toBeUndefined();
  });

  it("has nothing to say about a place with no label", () => {
    // A place typed in by hand, which is every field this can be handed.
    expect(formatLocationContext({ name: "The Boat" })).toBeUndefined();
    expect(
      formatLocationContext({ name: "The Boat", display_name: null }),
    ).toBeUndefined();
    expect(
      formatLocationContext({ name: "The Boat", display_name: "  " }),
    ).toBeUndefined();
  });

  it("gives the whole label to a place with no name to trim off it", () => {
    expect(
      formatLocationContext({ display_name: "Dahab, South Sinai, Egypt" }),
    ).toBe("Dahab, South Sinai, Egypt");
    expect(
      formatLocationContext({
        name: " ",
        display_name: "Dahab, South Sinai, Egypt",
      }),
    ).toBe("Dahab, South Sinai, Egypt");
  });

  it("trims each part of the label it keeps", () => {
    // The label is the provider's, and its spacing is not this app's to
    // reproduce faithfully.
    expect(
      formatLocationContext({
        name: "Dahab",
        display_name: "Dahab,South Sinai ,  Egypt",
      }),
    ).toBe("South Sinai, Egypt");
  });

  it("trims a multi-part name the label opens with", () => {
    // An address-only result has no name of its own and falls back to the
    // composed "Dahab, Egypt", which the label can repeat whole.
    expect(
      formatLocationContext({
        name: "Dahab, Egypt",
        display_name: "Dahab, Egypt, South Sinai",
      }),
    ).toBe("South Sinai");
  });
});
