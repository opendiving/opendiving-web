import { describe, expect, it } from "vitest";
import type { DiveActivityPoint } from "@/lib/api/dive-stats";
import {
  activityBars,
  barCeiling,
  divingYears,
  stepYear,
  summarizeActivity,
} from "@/lib/dive-activity";

// A logbook with the shape these functions exist for: two busy seasons, a year
// off between them, and months that never saw the water. The API only ever
// sends the months with diving in them, which is what makes the gap-filling
// below the interesting part.
const LOGBOOK: DiveActivityPoint[] = [
  { year: 2023, month: 4, dives: 6 },
  { year: 2023, month: 5, dives: 3 },
  { year: 2025, month: 2, dives: 9 },
  { year: 2025, month: 8, dives: 12 },
  { year: 2025, month: 9, dives: 4 },
];

function labelled(
  points: DiveActivityPoint[],
  scope: "year" | "month",
  year: number,
) {
  return activityBars(points, scope, year).map(
    (bar) => `${bar.label}:${bar.dives}`,
  );
}

describe("divingYears", () => {
  it("lists only the years that contain dives, oldest first", () => {
    // 2024 is missing on purpose: it's what the dropdown offers, and an option
    // for a year with nothing in it is an option not worth having.
    expect(divingYears(LOGBOOK)).toEqual([2023, 2025]);
  });

  it("has nothing to offer for an empty logbook", () => {
    expect(divingYears([])).toEqual([]);
  });
});

describe("activityBars", () => {
  it("sums a year's months into one bar", () => {
    expect(labelled(LOGBOOK, "year", 2025)).toEqual([
      "2023:9",
      "2024:0",
      "2025:25",
    ]);
  });

  it("keeps a fallow year as the gap it was", () => {
    // The whole point of filling gaps: without 2024 sitting there empty, the
    // two seasons would be drawn side by side and read as consecutive.
    expect(activityBars(LOGBOOK, "year", 2025)[1]).toMatchObject({
      key: 2024,
      dives: 0,
    });
  });

  it("draws no bars before the first dive or after the last", () => {
    // A gap in a career is diving that didn't happen; the years either side of
    // it are not diving that hasn't happened yet.
    const years = activityBars(LOGBOOK, "year", 2025).map((bar) => bar.key);

    expect(Math.min(...years)).toBe(2023);
    expect(Math.max(...years)).toBe(2025);
  });

  it("always draws twelve months, whatever the year held", () => {
    expect(labelled(LOGBOOK, "month", 2023)).toEqual([
      "Jan:0",
      "Feb:0",
      "Mar:0",
      "Apr:6",
      "May:3",
      "Jun:0",
      "Jul:0",
      "Aug:0",
      "Sep:0",
      "Oct:0",
      "Nov:0",
      "Dec:0",
    ]);
  });

  it("keeps the same month in different years apart", () => {
    expect(labelled(LOGBOOK, "month", 2025)[1]).toBe("Feb:9");
    expect(labelled(LOGBOOK, "month", 2023)[1]).toBe("Feb:0");
  });

  it("names a month in full, with its year, for the tooltip", () => {
    // The axis label can't carry the year - there is one label per month and
    // one year for all of them - so the long name is what the hover card and
    // the screen-reader list use.
    expect(activityBars(LOGBOOK, "month", 2025)[7].name).toBe("August 2025");
  });

  it("has no bars at all for an empty logbook", () => {
    expect(activityBars([], "year", 2025)).toEqual([]);
  });
});

describe("barCeiling", () => {
  it("is the busiest year across the whole logbook", () => {
    expect(barCeiling(LOGBOOK, "year")).toBe(25);
  });

  it("is the busiest month across every year, not just the one on screen", () => {
    // August 2025's twelve, even while 2023 is the year being displayed. This
    // is what makes paging between years compare anything: a fixed axis draws
    // a quiet year as a quiet year.
    expect(barCeiling(LOGBOOK, "month")).toBe(12);
  });

  it("is zero for an empty logbook", () => {
    expect(barCeiling([], "month")).toBe(0);
  });
});

describe("stepYear", () => {
  const years = divingYears(LOGBOOK);

  it("skips the years with no diving in them", () => {
    // Not 2024: stepping into an empty year is a click that shows nothing, and
    // a diver with a decade of gaps would click all afternoon.
    expect(stepYear(2023, 1, years)).toBe(2025);
    expect(stepYear(2025, -1, years)).toBe(2023);
  });

  it("has nowhere to go at either end", () => {
    expect(stepYear(2025, 1, years)).toBeNull();
    expect(stepYear(2023, -1, years)).toBeNull();
  });

  it("steps out of a year that isn't in the list at all", () => {
    // Reachable when the visible year empties out between visits; the arrows
    // should still take you somewhere real.
    expect(stepYear(2024, -1, years)).toBe(2023);
    expect(stepYear(2024, 1, years)).toBe(2025);
  });
});

describe("summarizeActivity", () => {
  it("counts the whole logbook at the year scope", () => {
    expect(summarizeActivity(LOGBOOK, "year", 2025)).toMatchObject({
      dives: 34,
      busiestLabel: "2025",
      busiestDives: 25,
    });
  });

  it("has nothing to compare a whole career against", () => {
    expect(summarizeActivity(LOGBOOK, "year", 2025)).toMatchObject({
      change: null,
      previousLabel: null,
    });
  });

  it("counts one year at the month scope, and names its busiest month", () => {
    expect(summarizeActivity(LOGBOOK, "month", 2025)).toMatchObject({
      dives: 25,
      busiestLabel: "August",
      busiestDives: 12,
    });
  });

  it("compares against the previous year with diving, in dives", () => {
    // 25 against 2023's 9, skipping the empty 2024 - "vs 2024" would be a
    // comparison against an off-season, which says nothing about the diving.
    expect(summarizeActivity(LOGBOOK, "month", 2025)).toMatchObject({
      change: 16,
      previousLabel: "2023",
    });
  });

  it("has nothing to compare the first year of diving against", () => {
    expect(summarizeActivity(LOGBOOK, "month", 2023)).toMatchObject({
      change: null,
      previousLabel: null,
    });
  });

  it("resolves a tie to the earlier bucket", () => {
    const tied: DiveActivityPoint[] = [
      { year: 2025, month: 3, dives: 5 },
      { year: 2025, month: 7, dives: 5 },
    ];

    expect(summarizeActivity(tied, "month", 2025)?.busiestLabel).toBe("March");
  });

  it("says nothing at all about an empty view", () => {
    // Null rather than a row of zeroes: "0 dives" above a chart already saying
    // there is nothing to plot is the same absence stated twice.
    expect(summarizeActivity([], "year", 2025)).toBeNull();
    expect(summarizeActivity(LOGBOOK, "month", 2024)).toBeNull();
  });
});
