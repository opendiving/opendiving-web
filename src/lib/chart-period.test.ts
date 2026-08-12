import { describe, expect, it } from "vitest";
import {
  availablePeriods,
  periodLabel,
  periodRange,
  resolveAnchor,
  stepPeriod,
} from "@/lib/chart-period";

// Moved here, unchanged, from `dive-gas.test.ts` and `gas-use-view.test.ts` when
// the functions themselves moved - the activity card windows its series the same
// way, and these rules are now what keeps the two cards' period controls
// behaving identically. The times below read as dives because that is what they
// were written against; the activity card feeds the same functions the start of
// each day it has diving on.

describe("periodRange", () => {
  it("bounds a calendar year, half-open", () => {
    expect(periodRange(Date.UTC(2026, 3, 17), "year")).toEqual({
      start: Date.UTC(2026, 0, 1),
      end: Date.UTC(2027, 0, 1),
    });
  });

  it("bounds a calendar month, half-open", () => {
    expect(periodRange(Date.UTC(2026, 3, 17), "month")).toEqual({
      start: Date.UTC(2026, 3, 1),
      end: Date.UTC(2026, 4, 1),
    });
  });

  it("rolls a December month into the next year", () => {
    expect(periodRange(Date.UTC(2026, 11, 25), "month")).toEqual({
      start: Date.UTC(2026, 11, 1),
      end: Date.UTC(2027, 0, 1),
    });
  });

  it("reads the anchor in UTC, not the viewer's timezone", () => {
    // Times fed to this come from `diveWallClockTime`, which encodes the dive's
    // *own* local time as a UTC-reading instant. Using the local getters here
    // would put a New Year's Eve dive in a different year for a viewer in
    // Sydney than for one in Los Angeles.
    const newYearsEve = Date.UTC(2025, 11, 31, 23, 30);

    expect(periodRange(newYearsEve, "year").start).toBe(Date.UTC(2025, 0, 1));
  });
});

describe("periodLabel", () => {
  it("names the scope's period", () => {
    expect(periodLabel(Date.UTC(2026, 3, 17), "all")).toBe("All time");
    expect(periodLabel(Date.UTC(2026, 3, 17), "year")).toBe("2026");
    expect(periodLabel(Date.UTC(2026, 3, 17), "month")).toBe("April 2026");
  });
});

describe("stepPeriod", () => {
  // Two trips a season apart, plus one the following year.
  const times = [
    Date.UTC(2025, 3, 10),
    Date.UTC(2025, 3, 12),
    Date.UTC(2025, 9, 5),
    Date.UTC(2026, 2, 1),
  ];

  it("skips empty periods rather than stepping through them", () => {
    // April -> October, not April -> May -> June -> ... -> October.
    expect(stepPeriod(Date.UTC(2025, 3, 10), "month", 1, times)).toBe(
      Date.UTC(2025, 9, 5),
    );
  });

  it("steps backwards to the last dive before the current period", () => {
    expect(stepPeriod(Date.UTC(2025, 9, 5), "month", -1, times)).toBe(
      Date.UTC(2025, 3, 12),
    );
  });

  it("steps by year when the scope is a year", () => {
    expect(stepPeriod(Date.UTC(2025, 3, 10), "year", 1, times)).toBe(
      Date.UTC(2026, 2, 1),
    );
  });

  it("returns null at either end, which is what disables the button", () => {
    expect(stepPeriod(Date.UTC(2026, 2, 1), "year", 1, times)).toBeNull();
    expect(stepPeriod(Date.UTC(2025, 3, 10), "year", -1, times)).toBeNull();
  });

  it("does not land back inside the period it started in", () => {
    // Both April dives are in the same month, so stepping forward from the
    // first must clear the whole month, not advance to its sibling.
    expect(stepPeriod(Date.UTC(2025, 3, 10), "month", 1, times)).not.toBe(
      Date.UTC(2025, 3, 12),
    );
  });
});

describe("availablePeriods", () => {
  const times = [
    Date.UTC(2025, 3, 10),
    Date.UTC(2025, 3, 12),
    Date.UTC(2025, 9, 5),
    Date.UTC(2026, 2, 1),
  ];

  it("lists one option per year that has dives, oldest first", () => {
    expect(availablePeriods(times, "year").map((p) => p.start)).toEqual([
      Date.UTC(2025, 0, 1),
      Date.UTC(2026, 0, 1),
    ]);
  });

  it("lists one option per month that has dives", () => {
    expect(availablePeriods(times, "month").map((p) => p.start)).toEqual([
      Date.UTC(2025, 3, 1),
      Date.UTC(2025, 9, 1),
      Date.UTC(2026, 2, 1),
    ]);
  });

  it("offers no option for a period with no dives", () => {
    // 2024 sits between two years that do have dives and must not appear.
    const spanning = [Date.UTC(2023, 5, 1), Date.UTC(2025, 5, 1)];

    expect(availablePeriods(spanning, "year").map((p) => p.start)).toEqual([
      Date.UTC(2023, 0, 1),
      Date.UTC(2025, 0, 1),
    ]);
  });

  it("carries a real dive time as the anchor, not the period start", () => {
    // The whole point: picking "2025" and then switching to Month has to land
    // on a month with dives in it, not on an empty January.
    const [y2025] = availablePeriods(times, "year");

    expect(times).toContain(y2025.anchor);
    expect(y2025.anchor).not.toBe(y2025.start);
  });

  it("represents each period by its most recent dive", () => {
    const [april] = availablePeriods(times, "month");

    expect(april.anchor).toBe(Date.UTC(2025, 3, 12));
  });

  it("returns nothing for an empty series", () => {
    expect(availablePeriods([], "year")).toEqual([]);
  });
});

describe("resolveAnchor", () => {
  // Two dives in April 2025, one in October, one in March 2026.
  const times = [
    Date.UTC(2025, 3, 10),
    Date.UTC(2025, 3, 12),
    Date.UTC(2025, 9, 5),
    Date.UTC(2026, 2, 1),
  ];

  it("keeps an anchor whose dive is still there", () => {
    expect(resolveAnchor(times[2], "month", times)).toBe(times[2]);
  });

  it("falls back to the most recent when nothing was remembered", () => {
    expect(resolveAnchor(null, "year", times)).toBeNull();
  });

  it("falls back to the most recent when there are no dives at all", () => {
    expect(resolveAnchor(times[0], "year", [])).toBeNull();
  });

  it("lands on the same period when the remembered dive is gone", () => {
    // The April 10th dive was deleted, or its time was edited. The diver was
    // reading April 2025 and should still be reading April 2025.
    const withoutFirst = times.slice(1);

    expect(resolveAnchor(times[0], "month", withoutFirst)).toBe(times[1]);
  });

  it("gives up when the whole period is gone", () => {
    // Every April dive removed - there is no April 2025 to restore, and the
    // period select would render an empty trigger if we tried.
    const withoutApril = times.slice(2);

    expect(resolveAnchor(times[0], "month", withoutApril)).toBeNull();
  });

  it("resolves against the period the scope means", () => {
    // The same missing dive: April is gone as a *month*, but 2025 still has
    // October in it, so the year scope has somewhere to land.
    const withoutApril = times.slice(2);

    expect(resolveAnchor(times[0], "month", withoutApril)).toBeNull();
    expect(resolveAnchor(times[0], "year", withoutApril)).toBe(times[2]);
  });

  it("has no period to fall back to in the all scope", () => {
    // "All" plots everything regardless, so a stale anchor there only affects
    // where switching back to Year or Month lands - the default is right.
    expect(resolveAnchor(Date.UTC(2020, 0, 1), "all", times)).toBeNull();
  });
});
