import { describe, expect, it } from "vitest";
import type { Dive, DiveMixture } from "@/lib/api/dives";
import {
  availablePeriods,
  gasUseUnavailableReason,
  periodLabel,
  periodRange,
  rollingMean,
  segmentByGap,
  stepPeriod,
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
      "Add an average depth to see your air consumption.",
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
      "Add an average depth and this tank's start and end pressure to see your air consumption.",
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
