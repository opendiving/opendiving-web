import { describe, expect, it } from "vitest";
import type { Dive, DiveMixture } from "@/lib/api/dives";
import {
  type GasUseScope,
  availablePeriods,
  bandRanges,
  gasUseUnavailableReason,
  periodLabel,
  periodRange,
  rollingMean,
  rollingStdDev,
  scopeRange,
  segmentByGap,
  stepPeriod,
  summarizeGasUse,
  trendWindow,
} from "@/lib/dive-gas";

function mixture(overrides: Partial<DiveMixture> = {}): DiveMixture {
  return {
    id: 1,
    name: "Back Gas",
    volume: 12,
    start_pressure: 200,
    end_pressure: 50,
    oxygen: 21,
    helium: 0,
    ...overrides,
  };
}

function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "d1",
    dive_number: 1,
    start_time: "2026-04-04T10:04:47+02:00",
    duration: 2700,
    avg_depth: 18,
    dive_sites: [],
    gear_items: [],
    notes: "",
    user_uuid: "u1",
    created_at: "2026-04-04T08:04:47Z",
    mixtures: [mixture()],
    ...overrides,
  };
}

describe("gasUseUnavailableReason", () => {
  it("says nothing when the API already derived a figure", () => {
    const derived = dive({
      gas_use: { gas_used: 1800, rmv: 14.29, sac_bar_per_min: 1.19 },
    });

    expect(gasUseUnavailableReason(derived)).toBeNull();
  });

  it("says nothing for a dive that logs no tank at all", () => {
    // Never a candidate, so there is no absence to explain - a freedive or an
    // old entry logged before mixtures were filled in shouldn't grow a nag.
    expect(gasUseUnavailableReason(dive({ mixtures: [] }))).toBeNull();
  });

  it("says nothing for a dive from the list response", () => {
    // The list carries neither `mixtures` nor `gas_use`, so without the guard
    // every row would claim its pressures were missing.
    const listDive = dive();
    delete (listDive as Partial<Dive>).mixtures;

    expect(gasUseUnavailableReason(listDive)).toBeNull();
  });

  it("names multi-tank as a limitation, not a missing field", () => {
    const reason = gasUseUnavailableReason(
      dive({ mixtures: [mixture(), mixture({ id: 2, name: "Deco Gas 1" })] }),
    );

    expect(reason).toMatch(/multi-tank/i);
    // It must not ask the diver to add anything - the data is all there.
    expect(reason).not.toMatch(/^Add /);
  });

  it("asks for an average depth when only that is missing", () => {
    expect(gasUseUnavailableReason(dive({ avg_depth: undefined }))).toBe(
      "Add an average depth to see your gas consumption.",
    );
  });

  it("treats a zero or negative average depth as missing", () => {
    expect(gasUseUnavailableReason(dive({ avg_depth: 0 }))).toMatch(
      /average depth/,
    );
  });

  it("asks for pressures when only those are missing", () => {
    const noStart = dive({
      mixtures: [mixture({ start_pressure: undefined })],
    });
    const noEnd = dive({ mixtures: [mixture({ end_pressure: undefined })] });

    expect(gasUseUnavailableReason(noStart)).toMatch(/start and end pressure/);
    expect(gasUseUnavailableReason(noEnd)).toMatch(/start and end pressure/);
  });

  it("asks for both when both are missing", () => {
    const bare = dive({
      avg_depth: undefined,
      mixtures: [
        mixture({ start_pressure: undefined, end_pressure: undefined }),
      ],
    });

    expect(gasUseUnavailableReason(bare)).toBe(
      "Add an average depth and this tank's start and end pressure to see your gas consumption.",
    );
  });

  it("explains an unbreathed tank when the pressures are equal", () => {
    const untouched = dive({
      mixtures: [mixture({ start_pressure: 200, end_pressure: 200 })],
    });

    expect(gasUseUnavailableReason(untouched)).toMatch(/no gas used/);
  });
});

describe("rollingMean", () => {
  it("averages over a trailing window", () => {
    expect(rollingMean([10, 20, 30, 40], 2)).toEqual([10, 15, 25, 35]);
  });

  it("uses a shorter window before the series is long enough", () => {
    // The line has to start at the first point - beginning it `window` points
    // in would leave a gap that reads as missing data.
    expect(rollingMean([10, 20, 30], 5)).toEqual([10, 15, 20]);
  });

  it("returns nothing for an empty series", () => {
    expect(rollingMean([], 5)).toEqual([]);
  });

  it("smooths a spike instead of following it", () => {
    const smoothed = rollingMean([12, 12, 30, 12, 12], 5);

    expect(Math.max(...smoothed)).toBeLessThan(20);
  });
});

describe("trendWindow", () => {
  // Long enough that the proportional cap never binds - see the short-log
  // cases below for where it does.
  const LONG = 300;

  it("smooths harder the more history is on screen", () => {
    expect(trendWindow("month", LONG)).toBe(5);
    expect(trendWindow("year", LONG)).toBe(10);
    expect(trendWindow("all", LONG)).toBe(20);
  });

  it("narrows the window to a third of the series once that is the tighter bound", () => {
    // 30 dives at "all" would otherwise average 20 of them into every point,
    // leaving a line that can only drift toward the overall mean.
    //
    // A third is the *upper* bound, not an invariant - the five-dive floor in the
    // next test overrides it for anything under 15 dives, where a third would be
    // one or two. The old name for this test ("never smooths over more than a
    // third") claimed otherwise, and the very next test contradicted it.
    expect(trendWindow("all", 30)).toBe(10);
    expect(trendWindow("year", 24)).toBe(8);
  });

  it("never drops below the five-dive floor", () => {
    // A third of a short log is one or two dives, which is no smoothing at
    // all - the trend would just retrace the dots.
    expect(trendWindow("all", 12)).toBe(5);
    expect(trendWindow("month", 2)).toBe(5);
    expect(trendWindow("all", 0)).toBe(5);
  });

  it("only ever widens the window as the scope widens", () => {
    // The property the whole thing rests on: switching Month -> Year -> All
    // must never make the trend twitchier than it already was.
    for (const count of [0, 2, 12, 24, 30, 60, LONG]) {
      expect(trendWindow("year", count)).toBeGreaterThanOrEqual(
        trendWindow("month", count),
      );
      expect(trendWindow("all", count)).toBeGreaterThanOrEqual(
        trendWindow("year", count),
      );
    }
  });
});

describe("rollingStdDev", () => {
  it("is zero for a window with nothing to vary", () => {
    // The first point averages over itself alone, so the band pinches to the
    // line there rather than starting at some invented width.
    expect(rollingStdDev([14], 5)).toEqual([0]);
    expect(rollingStdDev([14, 14, 14], 5)).toEqual([0, 0, 0]);
  });

  it("measures the spread of the trailing window", () => {
    // Population form: mean 15, deviations ±5, so 5 - not the 7.07 the sample
    // form would give.
    expect(rollingStdDev([10, 20], 2)).toEqual([0, 5]);
  });

  it("forgets a spike once it leaves the window", () => {
    const spread = rollingStdDev([12, 12, 30, 12, 12, 12], 3);

    expect(spread[2]).toBeGreaterThan(0);
    expect(spread[5]).toBe(0);
  });

  it("returns nothing for an empty series", () => {
    expect(rollingStdDev([], 5)).toEqual([]);
  });
});

describe("bandRanges", () => {
  it("shades alternate months of a year, starting at February", () => {
    const bands = bandRanges(
      "year",
      periodRange(Date.UTC(2026, 3, 17), "year"),
    );

    expect(bands).toHaveLength(6);
    expect(bands[0]).toEqual({
      start: Date.UTC(2026, 1, 1),
      end: Date.UTC(2026, 2, 1),
    });
    expect(bands[5].end).toBe(Date.UTC(2027, 0, 1));
  });

  it("shades alternate years across a career", () => {
    const range = { start: Date.UTC(2023, 5, 1), end: Date.UTC(2026, 2, 1) };

    expect(bandRanges("all", range)).toEqual([
      { start: Date.UTC(2024, 0, 1), end: Date.UTC(2025, 0, 1) },
      // Clamped: the series ends in March, so the 2026 band does too.
      { start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 2, 1) },
    ]);
  });

  it("never runs outside the plotted range", () => {
    const range = { start: Date.UTC(2023, 5, 1), end: Date.UTC(2026, 2, 1) };

    for (const band of bandRanges("all", range)) {
      expect(band.start).toBeGreaterThanOrEqual(range.start);
      expect(band.end).toBeLessThanOrEqual(range.end);
      expect(band.end).toBeGreaterThan(band.start);
    }
  });

  it("drops a band a partial year leaves no room for", () => {
    // A career that starts in December of its second (shaded) year: the band
    // would be a sliver behind the axis, not a readable block.
    const range = { start: Date.UTC(2025, 0, 1), end: Date.UTC(2026, 0, 1) };

    expect(bandRanges("all", range)).toEqual([]);
  });

  it("does not subdivide a month", () => {
    expect(
      bandRanges("month", periodRange(Date.UTC(2026, 3, 17), "month")),
    ).toEqual([]);
  });
});

describe("summarizeGasUse", () => {
  // Two dives in April 2025 averaging 20, two in October averaging 15, one in
  // March 2026 at 12.
  const times = [
    Date.UTC(2025, 3, 10),
    Date.UTC(2025, 3, 12),
    Date.UTC(2025, 9, 5),
    Date.UTC(2025, 9, 7),
    Date.UTC(2026, 2, 1),
  ];
  const rmvs = [18, 22, 14, 16, 12];

  it("averages the whole series for the all scope", () => {
    const summary = summarizeGasUse(times, rmvs, "all", times[4]);

    expect(summary).toMatchObject({ dives: 5, average: 16.4, best: 12 });
  });

  it("has nothing to compare the all scope against", () => {
    const summary = summarizeGasUse(times, rmvs, "all", times[4]);

    expect(summary?.changePercent).toBeNull();
    expect(summary?.previousLabel).toBeNull();
  });

  it("averages only the anchored period", () => {
    const summary = summarizeGasUse(times, rmvs, "month", times[0]);

    expect(summary).toMatchObject({ dives: 2, average: 20, best: 18 });
  });

  it("reports an improvement as a negative change", () => {
    // October averaged 15 against April's 20. Lower is better, so this is a 25%
    // improvement and the sign has to say so.
    const summary = summarizeGasUse(times, rmvs, "month", times[2]);

    expect(summary?.changePercent).toBeCloseTo(-25);
    expect(summary?.previousLabel).toBe("April 2025");
  });

  it("compares against the previous period with dives, not the previous calendar one", () => {
    // March 2026's predecessor is October 2025, five empty months back - "vs
    // February" would be comparing against nothing.
    const summary = summarizeGasUse(times, rmvs, "month", times[4]);

    expect(summary?.previousLabel).toBe("October 2025");
    expect(summary?.changePercent).toBeCloseTo(-20);
  });

  it("compares years when the scope is a year", () => {
    const summary = summarizeGasUse(times, rmvs, "year", times[4]);

    expect(summary?.previousLabel).toBe("2025");
    // 12 against 2025's average of 17.5.
    expect(summary?.changePercent).toBeCloseTo(-31.43, 1);
  });

  it("has nothing to compare the earliest period against", () => {
    const summary = summarizeGasUse(times, rmvs, "month", times[0]);

    expect(summary?.changePercent).toBeNull();
    expect(summary?.previousLabel).toBeNull();
  });

  it("returns null for a period with no dives", () => {
    expect(summarizeGasUse([], [], "all", 0)).toBeNull();
    expect(
      summarizeGasUse(times, rmvs, "month", Date.UTC(2025, 6, 1)),
    ).toBeNull();
  });
});

describe("segmentByGap", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("keeps a continuous run in one segment", () => {
    const times = [0, DAY, 2 * DAY];

    expect(segmentByGap(times, 60)).toEqual([[0, 1, 2]]);
  });

  it("splits where the break exceeds the threshold", () => {
    // Two dives in April, two in October - the six months between them is not a
    // gentle decline in consumption, it's an off-season.
    const times = [0, DAY, 200 * DAY, 201 * DAY];

    expect(segmentByGap(times, 60)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("does not split on a gap exactly at the threshold", () => {
    expect(segmentByGap([0, 60 * DAY], 60)).toEqual([[0, 1]]);
    expect(segmentByGap([0, 61 * DAY], 60)).toEqual([[0], [1]]);
  });

  it("covers every index exactly once, in order", () => {
    const times = [0, 100 * DAY, 101 * DAY, 500 * DAY];

    expect(segmentByGap(times, 60).flat()).toEqual([0, 1, 2, 3]);
  });

  it("returns nothing for an empty series", () => {
    expect(segmentByGap([], 60)).toEqual([]);
  });
});

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

describe("scopeRange", () => {
  // Callers filter with `time >= start && time < end`, so these tests assert on
  // what actually survives that filter rather than on the bounds themselves -
  // the bug this replaced had perfectly reasonable-looking bounds.
  const visible = (times: number[], anchor: number, scope: GasUseScope) => {
    const range = scopeRange(times, anchor, scope);
    return times.filter((time) => time >= range.start && time < range.end);
  };

  it("delegates to periodRange for year and month", () => {
    const anchor = Date.UTC(2026, 3, 17);
    expect(scopeRange([anchor], anchor, "year")).toEqual(
      periodRange(anchor, "year"),
    );
    expect(scopeRange([anchor], anchor, "month")).toEqual(
      periodRange(anchor, "month"),
    );
  });

  // The regression: an "all" range ending at the last dive's own timestamp
  // dropped that dive from the plot, so the chart always showed one fewer dive
  // than the card's "Dives" stat above it.
  it("includes the newest dive at the 'all' scope", () => {
    const times = [
      Date.UTC(2025, 3, 10),
      Date.UTC(2025, 8, 2),
      Date.UTC(2026, 3, 17),
    ];

    expect(visible(times, times[0], "all")).toEqual(times);
  });

  it("includes every dive tied at the newest timestamp", () => {
    const last = Date.UTC(2026, 3, 17);
    const times = [Date.UTC(2025, 3, 10), last, last];

    expect(visible(times, times[0], "all")).toEqual(times);
  });

  it("handles a single-dive series", () => {
    const only = Date.UTC(2026, 3, 17);
    expect(visible([only], only, "all")).toEqual([only]);
  });

  it("returns a degenerate, non-NaN range for an empty series", () => {
    const range = scopeRange([], 0, "all");
    expect(Number.isNaN(range.start)).toBe(false);
    expect(Number.isNaN(range.end)).toBe(false);
    expect(range.end).toBeGreaterThan(range.start);
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
