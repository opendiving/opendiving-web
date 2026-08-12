import { describe, expect, it } from "vitest";
import type { DiveActivityPoint } from "@/lib/api/dive-stats";
import {
  activityBars,
  activityDays,
  barCeiling,
  summarizeActivity,
} from "@/lib/dive-activity";

// A logbook with the shape these functions exist for: two busy seasons, a year
// off between them, months that never saw the water, and days that did more than
// one dive. The API only ever sends the days with diving on them, which is what
// makes the gap-filling below the interesting part.
const LOGBOOK: DiveActivityPoint[] = [
  { year: 2023, month: 4, day: 8, dives: 4 },
  { year: 2023, month: 4, day: 9, dives: 2 },
  { year: 2023, month: 5, day: 20, dives: 3 },
  { year: 2025, month: 2, day: 3, dives: 9 },
  { year: 2025, month: 8, day: 11, dives: 5 },
  { year: 2025, month: 8, day: 12, dives: 7 },
  { year: 2025, month: 9, day: 30, dives: 4 },
];

// The card always anchors on a day that has diving on it, so the tests do too.
const day = (year: number, month: number, date: number) =>
  Date.UTC(year, month - 1, date);

function labelled(
  points: DiveActivityPoint[],
  scope: "all" | "year" | "month",
  anchor: number,
) {
  return activityBars(points, scope, anchor).map(
    (bar) => `${bar.label}:${bar.dives}`,
  );
}

describe("activityDays", () => {
  it("gives one timestamp per day with diving, oldest first", () => {
    // These are what the period controls step through and pick from, so they
    // have to be the days themselves - not the months they fall in.
    expect(activityDays(LOGBOOK).slice(0, 3)).toEqual([
      day(2023, 4, 8),
      day(2023, 4, 9),
      day(2023, 5, 20),
    ]);
  });

  it("has nothing to offer for an empty logbook", () => {
    expect(activityDays([])).toEqual([]);
  });
});

describe("activityBars", () => {
  it("sums a year's days into one bar at the all scope", () => {
    expect(labelled(LOGBOOK, "all", day(2025, 8, 12))).toEqual([
      "2023:9",
      "2024:0",
      "2025:25",
    ]);
  });

  it("keeps a fallow year as the gap it was", () => {
    // The whole point of filling gaps: without 2024 sitting there empty, the
    // two seasons would be drawn side by side and read as consecutive.
    expect(activityBars(LOGBOOK, "all", day(2025, 8, 12))[1]).toMatchObject({
      key: 2024,
      dives: 0,
    });
  });

  it("draws no bars before the first dive or after the last", () => {
    // A gap in a career is diving that didn't happen; the years either side of
    // it are not diving that hasn't happened yet.
    const years = activityBars(LOGBOOK, "all", day(2025, 8, 12)).map(
      (bar) => bar.key,
    );

    expect(Math.min(...years)).toBe(2023);
    expect(Math.max(...years)).toBe(2025);
  });

  it("always draws twelve months at the year scope, whatever the year held", () => {
    expect(labelled(LOGBOOK, "year", day(2023, 4, 8))).toEqual([
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

  it("sums a month's days into one bar at the year scope", () => {
    // August 2025 is two days of diving, 5 and 7, and one bar of 12.
    expect(labelled(LOGBOOK, "year", day(2025, 8, 12))[7]).toBe("Aug:12");
  });

  it("keeps the same month in different years apart", () => {
    expect(labelled(LOGBOOK, "year", day(2025, 8, 12))[1]).toBe("Feb:9");
    expect(labelled(LOGBOOK, "year", day(2023, 4, 8))[1]).toBe("Feb:0");
  });

  it("draws every day of the anchored month, and only that month", () => {
    const bars = activityBars(LOGBOOK, "month", day(2025, 8, 12));

    expect(bars).toHaveLength(31);
    expect(bars[10]).toMatchObject({ key: 11, label: "11", dives: 5 });
    expect(bars[11]).toMatchObject({ key: 12, label: "12", dives: 7 });
    // The 30th of September is in the logbook and must not leak into August.
    expect(bars[29].dives).toBe(0);
  });

  it("gets a short month's length right, leap years included", () => {
    expect(activityBars(LOGBOOK, "month", day(2025, 2, 3))).toHaveLength(28);
    expect(activityBars([], "month", day(2024, 2, 1))).toHaveLength(29);
    expect(activityBars([], "month", day(2025, 4, 1))).toHaveLength(30);
  });

  it("names a bucket in full, with its year, for the tooltip", () => {
    // The axis label can't carry the month or year - there is one label per
    // bucket and one period for all of them - so the long name is what the hover
    // card and the screen-reader list use.
    expect(activityBars(LOGBOOK, "year", day(2025, 8, 12))[7].name).toBe(
      "August 2025",
    );
    expect(activityBars(LOGBOOK, "month", day(2025, 8, 12))[11].name).toBe(
      "August 12, 2025",
    );
  });

  it("has no bars at all for an empty logbook", () => {
    expect(activityBars([], "all", day(2025, 8, 12))).toEqual([]);
  });
});

describe("barCeiling", () => {
  it("is the busiest year across the whole logbook", () => {
    expect(barCeiling(LOGBOOK, "all")).toBe(25);
  });

  it("is the busiest month across every year, not just the one on screen", () => {
    // August 2025's twelve, even while 2023 is the year being displayed. This
    // is what makes paging between periods compare anything: a fixed axis draws
    // a quiet year as a quiet year.
    expect(barCeiling(LOGBOOK, "year")).toBe(12);
  });

  it("is the busiest single day across the whole logbook", () => {
    expect(barCeiling(LOGBOOK, "month")).toBe(9);
  });

  it("is zero for an empty logbook", () => {
    expect(barCeiling([], "month")).toBe(0);
  });
});

describe("summarizeActivity", () => {
  it("counts the whole logbook at the all scope", () => {
    expect(summarizeActivity(LOGBOOK, "all", day(2025, 8, 12))).toMatchObject({
      dives: 34,
      busiestLabel: "2025",
      busiestDives: 25,
    });
  });

  it("has nothing to compare a whole career against", () => {
    expect(summarizeActivity(LOGBOOK, "all", day(2025, 8, 12))).toMatchObject({
      change: null,
      previousLabel: null,
    });
  });

  it("counts one year at the year scope, and names its busiest month", () => {
    expect(summarizeActivity(LOGBOOK, "year", day(2025, 8, 12))).toMatchObject({
      dives: 25,
      busiestLabel: "August",
      busiestDives: 12,
    });
  });

  it("counts one month at the month scope, and names its busiest day", () => {
    expect(summarizeActivity(LOGBOOK, "month", day(2025, 8, 12))).toMatchObject(
      {
        dives: 12,
        busiestLabel: "August 12",
        busiestDives: 7,
      },
    );
  });

  it("compares against the previous year with diving, in dives", () => {
    // 25 against 2023's 9, skipping the empty 2024 - "vs 2024" would be a
    // comparison against an off-season, which says nothing about the diving.
    expect(summarizeActivity(LOGBOOK, "year", day(2025, 8, 12))).toMatchObject({
      change: 16,
      previousLabel: "2023",
    });
  });

  it("compares against the previous month with diving, skipping the empty ones", () => {
    // August 2025 against February 2025, five months earlier: the months
    // between hold no diving at all.
    expect(summarizeActivity(LOGBOOK, "month", day(2025, 8, 12))).toMatchObject(
      {
        change: 3,
        previousLabel: "February 2025",
      },
    );
  });

  it("has nothing to compare the first period of diving against", () => {
    expect(summarizeActivity(LOGBOOK, "year", day(2023, 4, 8))).toMatchObject({
      change: null,
      previousLabel: null,
    });
    expect(summarizeActivity(LOGBOOK, "month", day(2023, 4, 8))).toMatchObject({
      change: null,
      previousLabel: null,
    });
  });

  it("resolves a tie to the earlier bucket", () => {
    const tied: DiveActivityPoint[] = [
      { year: 2025, month: 3, day: 4, dives: 5 },
      { year: 2025, month: 7, day: 9, dives: 5 },
    ];

    expect(summarizeActivity(tied, "year", day(2025, 3, 4))?.busiestLabel).toBe(
      "March",
    );
  });

  it("says nothing at all about an empty view", () => {
    // Null rather than a row of zeroes: "0 dives" above a chart already saying
    // there is nothing to plot is the same absence stated twice.
    expect(summarizeActivity([], "all", day(2025, 8, 12))).toBeNull();
    expect(summarizeActivity(LOGBOOK, "year", day(2024, 6, 1))).toBeNull();
    expect(summarizeActivity(LOGBOOK, "month", day(2025, 7, 1))).toBeNull();
  });
});
