import { describe, expect, it } from "vitest";
import type { DiveProfile } from "@/lib/api/dives";
import {
  MIN_GAP_SECONDS,
  buildAreaPath,
  elapsedTicks,
  formatChannelValue,
  gapThreshold,
  nearestSampleIndex,
  segmentByTimeGap,
  toChannelSeries,
  toPressureSeries,
  tooltipVerticalAnchor,
  PROFILE_CHANNELS,
} from "@/lib/dive-profile";

function profile(overrides: Partial<DiveProfile> = {}): DiveProfile {
  return {
    duration_seconds: 30,
    depth: { t: [0, 10, 20, 30], v: [139, 372, 632, 88] },
    temperature: { t: [0, 10, 20, 30], v: [219, 219, 218, 220] },
    pressure: [{ gas_number: 1, t: [0, 10], v: [2052, 2041] }],
    ...overrides,
  };
}

describe("toChannelSeries", () => {
  it("divides by the channel's scale exactly", () => {
    const series = toChannelSeries(profile(), "depth");

    // 139 cm is 1.39 m. `139 * 0.01` is 1.3900000000000001, which is why the
    // implementation divides.
    expect(series?.values).toEqual([1.39, 3.72, 6.32, 0.88]);
  });

  it("converts tenths of a degree without floating-point noise", () => {
    const series = toChannelSeries(
      profile({ temperature: { t: [0], v: [206] } }),
      "temperature",
    );

    expect(series?.values).toEqual([20.6]);
  });

  it("returns null for a channel the profile doesn't carry", () => {
    expect(toChannelSeries(profile({ temperature: null }), "temperature")).toBeNull();
  });

  it("returns null for an empty channel rather than an empty series", () => {
    expect(
      toChannelSeries(profile({ depth: { t: [], v: [] } }), "depth"),
    ).toBeNull();
  });

  it("carries the channel definition through", () => {
    expect(toChannelSeries(profile(), "depth")?.channel.inverted).toBe(true);
    expect(toChannelSeries(profile(), "temperature")?.channel.inverted).toBe(
      false,
    );
  });
});

describe("toPressureSeries", () => {
  it("keeps each cylinder separate and labelled by its gas number", () => {
    const series = toPressureSeries(
      profile({
        pressure: [
          { gas_number: 0, t: [0, 10], v: [2074, 2051] },
          { gas_number: 3, t: [0], v: [1500] },
        ],
      }),
    );

    expect(series.map((entry) => entry.gasNumber)).toEqual([0, 3]);
    expect(series[0].values).toEqual([207.4, 205.1]);
  });

  it("is an empty list when no transmitter recorded anything", () => {
    expect(toPressureSeries(profile({ pressure: [] }))).toEqual([]);
  });
});

describe("segmentByTimeGap", () => {
  it("returns one run for an unbroken series", () => {
    expect(segmentByTimeGap([0, 10, 20, 30], 30)).toEqual([[0, 1, 2, 3]]);
  });

  it("breaks where the gap exceeds the threshold", () => {
    // A transmitter that stopped reporting between 20 s and 620 s.
    expect(segmentByTimeGap([0, 10, 20, 620, 630], 30)).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
  });

  it("does not break on a gap exactly at the threshold", () => {
    expect(segmentByTimeGap([0, 30, 60], 30)).toEqual([[0, 1, 2]]);
  });

  it("handles an empty series", () => {
    expect(segmentByTimeGap([], 30)).toEqual([]);
  });

  it("handles a single sample", () => {
    expect(segmentByTimeGap([42], 30)).toEqual([[0]]);
  });
});

describe("gapThreshold", () => {
  it("scales with a series' own cadence", () => {
    // 10 s cadence (every Suunto depth series) -> 30 s.
    expect(gapThreshold([0, 10, 20, 30, 40])).toBe(30);
  });

  it("never drops below the floor on a fast series", () => {
    // 1 Hz temperature would otherwise break on a single rounding wobble.
    expect(gapThreshold([0, 1, 2, 3, 4])).toBe(MIN_GAP_SECONDS);
  });

  it("ignores a lone outlying gap when picking the threshold", () => {
    // The median delta is 10 despite the 600 s dropout, so the dropout is
    // above the threshold and gets broken - which is the point.
    const t = [0, 10, 20, 620, 630, 640];
    expect(gapThreshold(t)).toBe(30);
    expect(segmentByTimeGap(t, gapThreshold(t))).toHaveLength(2);
  });

  it("never breaks a series too short to have a cadence", () => {
    expect(gapThreshold([0, 10])).toBe(Number.POSITIVE_INFINITY);
    expect(segmentByTimeGap([0, 10], gapThreshold([0, 10]))).toEqual([[0, 1]]);
  });
});

describe("nearestSampleIndex", () => {
  const t = [0, 10, 20, 30, 40];

  it("finds an exact hit", () => {
    expect(nearestSampleIndex(t, 20)).toBe(2);
  });

  it("rounds a midpoint to the earlier sample", () => {
    expect(nearestSampleIndex(t, 15)).toBe(1);
  });

  it("picks the nearer neighbour", () => {
    expect(nearestSampleIndex(t, 16)).toBe(2);
    expect(nearestSampleIndex(t, 14)).toBe(1);
  });

  it("clamps before the first sample", () => {
    expect(nearestSampleIndex(t, -100)).toBe(0);
  });

  it("clamps after the last sample", () => {
    expect(nearestSampleIndex(t, 10_000)).toBe(4);
  });

  it("handles a single sample", () => {
    expect(nearestSampleIndex([7], 0)).toBe(0);
    expect(nearestSampleIndex([7], 700)).toBe(0);
  });

  it("handles an empty series", () => {
    expect(nearestSampleIndex([], 10)).toBe(-1);
  });

  it("works on an irregularly spaced series", () => {
    // What a downsampled channel looks like: bucketed, so unevenly spaced.
    const irregular = [0, 3, 47, 48, 900];
    expect(nearestSampleIndex(irregular, 46)).toBe(2);
    expect(nearestSampleIndex(irregular, 400)).toBe(3);
    expect(nearestSampleIndex(irregular, 500)).toBe(4);
  });
});

describe("elapsedTicks", () => {
  it("gives round minutes for a short dive", () => {
    // 12 minutes.
    expect(elapsedTicks(720)).toEqual([0, 120, 240, 360, 480, 600, 720]);
  });

  it("gives round minutes for a typical dive", () => {
    // 50 minutes -> a 10-minute step, not 8m20s.
    expect(elapsedTicks(3000)).toEqual([0, 600, 1200, 1800, 2400, 3000]);
  });

  it("gives round minutes for a long dive", () => {
    // 3 hours -> half-hourly.
    expect(elapsedTicks(10_800)).toEqual([
      0, 1800, 3600, 5400, 7200, 9000, 10_800,
    ]);
  });

  it("never runs past the end of the dive", () => {
    const ticks = elapsedTicks(2781);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(2781);
  });

  it("every tick is a whole number of minutes", () => {
    for (const duration of [720, 2781, 3000, 4401, 10_800]) {
      for (const tick of elapsedTicks(duration)) {
        expect(tick % 60).toBe(0);
      }
    }
  });

  it("survives a zero-length profile", () => {
    expect(elapsedTicks(0)).toEqual([0]);
  });
});

describe("tooltipVerticalAnchor", () => {
  // The chart's own plot bounds.
  const TOP = 14;
  const BOTTOM = 252;

  it("sits at the bottom when the topmost reading is high in the plot", () => {
    expect(tooltipVerticalAnchor(30, TOP, BOTTOM)).toEqual({
      y: BOTTOM,
      translateY: "calc(-100% - 4px)",
    });
  });

  it("sits at the top when the topmost reading is low in the plot", () => {
    expect(tooltipVerticalAnchor(200, TOP, BOTTOM)).toEqual({
      y: TOP,
      translateY: "4px",
    });
  });

  it("anchors to a plot edge for every reading, never to the reading itself", () => {
    // The regression this replaced: at ~34% down the plot the card flipped to
    // "above the point", where a 100px card had ~76px of room, and the scroll
    // container clipped it. No input can produce an anchor between the edges.
    for (let y = TOP; y <= BOTTOM; y++) {
      const anchor = tooltipVerticalAnchor(y, TOP, BOTTOM);
      expect([TOP, BOTTOM]).toContain(anchor.y);
    }
  });

  it("pins the card inside the plot in both placements", () => {
    // `y: BOTTOM` with `-100%` puts the card's *bottom* on the plot's bottom;
    // `y: TOP` with a positive offset puts its *top* on the plot's top. Both are
    // inside for any card height, which is the whole point.
    expect(tooltipVerticalAnchor(TOP, TOP, BOTTOM).translateY).toContain("-100%");
    expect(tooltipVerticalAnchor(BOTTOM, TOP, BOTTOM).translateY).not.toContain(
      "-100%",
    );
  });

  it("survives a zero-height plot rather than dividing by zero", () => {
    expect(tooltipVerticalAnchor(14, 14, 14).y).toBe(14);
  });
});

describe("buildAreaPath", () => {
  it("closes the shape along the baseline", () => {
    const path = buildAreaPath(
      [
        { x: 10, y: 20 },
        { x: 20, y: 40 },
        { x: 30, y: 30 },
      ],
      100,
    );

    expect(path).toBe("M10,20 L20,40 L30,30 L30,100 L10,100 Z");
  });

  it("is empty for an empty series, rather than a stray `Z`", () => {
    expect(buildAreaPath([], 100)).toBe("");
  });
});

describe("formatChannelValue", () => {
  it("shows each channel at the resolution it was stored in", () => {
    expect(formatChannelValue(16.9, PROFILE_CHANNELS.depth)).toBe("16.9 m");
    expect(formatChannelValue(21.62, PROFILE_CHANNELS.temperature)).toBe(
      "21.6 °C",
    );
    expect(formatChannelValue(205.2, PROFILE_CHANNELS.pressure)).toBe(
      "205 bar",
    );
  });
});
