import { describe, expect, it } from "vitest";
import { formatTripSpan, tripPartLocations, tripSpan } from "./trip-parts";

describe("tripSpan", () => {
  it("has nothing to say about a trip with no parts", () => {
    // A state the app has never had before: every caller answers for it rather
    // than formatting an absence.
    expect(tripSpan([])).toEqual({ start: undefined, end: undefined });
    expect(tripSpan(undefined)).toEqual({ start: undefined, end: undefined });
  });

  it("has nothing to say about parts that carry no dates", () => {
    expect(tripSpan([{ location: { name: "Dahab" } }])).toEqual({
      start: undefined,
      end: undefined,
    });
  });

  it("takes the earliest start and the latest end", () => {
    expect(
      tripSpan([
        { start_date: "2026-04-22", end_date: "2026-04-25" },
        { start_date: "2026-04-18", end_date: "2026-04-22" },
      ]),
    ).toEqual({ start: "2026-04-18", end: "2026-04-25" });
  });

  it("ignores the parts that carry no dates", () => {
    expect(
      tripSpan([
        { location: { name: "Dahab" } },
        { start_date: "2026-04-18", end_date: "2026-04-22" },
        { location: { name: "Sharm" } },
      ]),
    ).toEqual({ start: "2026-04-18", end: "2026-04-22" });
  });

  it("takes each end independently", () => {
    // A trip whose only dated part carries an end and no start has an end and
    // no start - what the data says, rather than an invented range. The API
    // derives it the same way.
    expect(tripSpan([{ end_date: "2026-04-25" }])).toEqual({
      start: undefined,
      end: "2026-04-25",
    });
    expect(
      tripSpan([{ start_date: "2026-04-18" }, { end_date: "2026-04-25" }]),
    ).toEqual({ start: "2026-04-18", end: "2026-04-25" });
  });

  it("reads null the way the API writes it", () => {
    expect(
      tripSpan([{ start_date: null, end_date: null, location: null }]),
    ).toEqual({ start: undefined, end: undefined });
  });
});

describe("formatTripSpan", () => {
  it("formats the span of the parts, not of any one of them", () => {
    expect(
      formatTripSpan([
        { start_date: "2026-04-18", end_date: "2026-04-22" },
        { start_date: "2026-04-22", end_date: "2026-04-25" },
      ]),
    ).toBe("Apr 18 - Apr 25, 2026");
  });

  it("answers undefined when no part carries a date", () => {
    // So a table can show "-" and a subtitle can disappear.
    expect(formatTripSpan([{ location: { name: "Dahab" } }])).toBeUndefined();
    expect(formatTripSpan([])).toBeUndefined();
  });

  it("shows the one date a half-dated trip has", () => {
    expect(formatTripSpan([{ start_date: "2026-04-18" }])).toBe("Apr 18, 2026");
  });

  it("passes its format options through", () => {
    expect(
      formatTripSpan([{ start_date: "2026-04-18" }], {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    ).toBe("April 18, 2026");
  });
});

describe("tripPartLocations", () => {
  it("keeps the diver's order and drops the parts with no place", () => {
    expect(
      tripPartLocations([
        { location: { name: "Dahab" } },
        { start_date: "2026-04-22" },
        { location: { name: "Sharm" } },
      ]),
    ).toEqual([{ name: "Dahab" }, { name: "Sharm" }]);
  });

  it("keeps a place named twice", () => {
    // A trip that returns to one is the shape this change exists to record, and
    // a label reading "Dahab, Sharm +1" is the honest one.
    expect(
      tripPartLocations([
        { location: { name: "Dahab" } },
        { location: { name: "Sharm" } },
        { location: { name: "Dahab" } },
      ]).map((location) => location.name),
    ).toEqual(["Dahab", "Sharm", "Dahab"]);
  });

  it("answers an absent list with an empty one", () => {
    expect(tripPartLocations(undefined)).toEqual([]);
    expect(tripPartLocations([{ location: null }])).toEqual([]);
  });
});
