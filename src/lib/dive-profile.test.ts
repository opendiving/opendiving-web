import { describe, expect, it } from "vitest";
import type { DiveProfile, DiveProfileEvent } from "@/lib/api/dives";
import {
  MIN_GAP_SECONDS,
  depthDomain,
  describeEvent,
  drawnSampleIndexAt,
  elapsedTicks,
  formatChannelValue,
  gapThreshold,
  nearestEvent,
  nearestSampleIndex,
  readoutTolerance,
  sampleIndexAt,
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
    events: [],
    ...overrides,
  };
}

function event(overrides: Partial<DiveProfileEvent> = {}): DiveProfileEvent {
  return { t: 0, type: "gas_switch", ...overrides };
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
    expect(
      toChannelSeries(profile({ temperature: null }), "temperature"),
    ).toBeNull();
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

describe("toChannelSeries for the ceiling", () => {
  it("divides by depth's scale, not one of its own", () => {
    // 300 cm is a 3.0 m ceiling - the commonest stop depth there is, and it has
    // to come out as the same number a 300 cm *depth* would.
    const ceiling = toChannelSeries(
      profile({ ceiling: { t: [730, 940], v: [300, 323] } }),
      "ceiling",
    );

    expect(ceiling?.values).toEqual([3, 3.23]);
    expect(ceiling?.channel.scale).toBe(PROFILE_CHANNELS.depth.scale);
  });

  it("is null on a dive that owed no decompression", () => {
    expect(toChannelSeries(profile(), "ceiling")).toBeNull();
  });

  it("shares depth's inverted axis", () => {
    expect(PROFILE_CHANNELS.ceiling.inverted).toBe(true);
  });

  it("is the only dashed channel, in the plot and the legend alike", () => {
    // Both the polyline's `strokeDasharray` and the legend swatch read this one
    // flag. They sit far apart in the component, and a solid swatch next to a
    // dashed curve is the one thing a legend must not say.
    const dashed = Object.values(PROFILE_CHANNELS)
      .filter((channel) => channel.dashed)
      .map((channel) => channel.key);

    expect(dashed).toEqual(["ceiling"]);
  });
});

describe("depthDomain", () => {
  it("anchors at the surface", () => {
    expect(depthDomain([12.4, 38.2, 4.1], []).min).toBe(0);
  });

  it("covers the deeper of the two channels", () => {
    const domain = depthDomain([12.4, 38.2], [3, 6.5]);

    expect(domain.min).toBe(0);
    expect(domain.max).toBeGreaterThanOrEqual(38.2);
  });

  it("is the same axis whether or not the ceiling is plotted", () => {
    // The property that keeps the depth curve still when the ceiling toggle is
    // clicked. It holds on real data because a ceiling is always shallower than
    // the depth it was computed at, so it never widens the domain.
    expect(depthDomain([12.4, 38.2], [3, 6.5])).toEqual(
      depthDomain([12.4, 38.2], []),
    );
  });

  it("still produces an axis for a ceiling with no depth channel", () => {
    const domain = depthDomain([], [3, 12.65]);

    expect(domain.min).toBe(0);
    expect(domain.max).toBeGreaterThanOrEqual(12.65);
  });
});

describe("nearestEvent", () => {
  const events = [
    event({ t: 0, type: "gas_switch", gas_number: 0 }),
    event({ t: 497, type: "other", label: "NoDecoTime" }),
    event({ t: 2075, type: "gas_switch", gas_number: 1 }),
  ];

  it("finds the closest marker within the tolerance", () => {
    expect(nearestEvent(events, 480, 40)?.label).toBe("NoDecoTime");
  });

  it("returns null when the nearest marker is out of reach", () => {
    // 1 200 s from either neighbour: the crosshair is nowhere near a marker, and
    // naming one anyway would caption something that isn't under it.
    expect(nearestEvent(events, 1280, 40)).toBeNull();
  });

  it("prefers the nearer of two markers on either side", () => {
    expect(nearestEvent(events, 300, 600)?.t).toBe(497);
    expect(nearestEvent(events, 200, 600)?.t).toBe(0);
  });

  it("gives a tie to the earlier marker, whatever order it arrived in", () => {
    expect(
      nearestEvent([event({ t: 100 }), event({ t: 200 })], 150, 60)?.t,
    ).toBe(100);
    // The half that array order alone would get wrong: the later marker is
    // listed first, and "earlier event" has to mean earlier in time.
    expect(
      nearestEvent([event({ t: 200 }), event({ t: 100 })], 150, 60)?.t,
    ).toBe(100);
  });

  it("does not assume the list arrived sorted", () => {
    const unsorted = [event({ t: 900 }), event({ t: 60 }), event({ t: 400 })];

    expect(nearestEvent(unsorted, 70, 30)?.t).toBe(60);
  });

  it("is null on a dive with no markers", () => {
    expect(nearestEvent([], 100, 60)).toBeNull();
  });

  it("includes a marker exactly at the tolerance", () => {
    expect(nearestEvent([event({ t: 100 })], 160, 60)?.t).toBe(100);
    expect(nearestEvent([event({ t: 100 })], 161, 60)).toBeNull();
  });
});

describe("sampleIndexAt", () => {
  it("is the nearest sample when there is one close enough", () => {
    expect(sampleIndexAt([0, 10, 20, 30], 21, 30)).toBe(2);
  });

  it("refuses to quote a reading from before a channel started", () => {
    // The ceiling case, and the reason this function exists. A deco ceiling that
    // begins at 730 s says nothing about the dive at 300 s - the diver owed no
    // decompression then, and clamping to the first sample would report a 3.0 m
    // ceiling they were never held to.
    const ceilingT = [730, 800, 810, 820];

    expect(sampleIndexAt(ceilingT, 300, gapThreshold(ceilingT))).toBe(-1);
    expect(sampleIndexAt(ceilingT, 735, gapThreshold(ceilingT))).toBe(0);
  });

  it("refuses inside a dropout, where no line is drawn either", () => {
    // A transmitter silent from 20 s to 620 s. Mid-dropout there is nothing
    // honest to report, and the polyline is broken across exactly this stretch.
    expect(sampleIndexAt([0, 10, 20, 620, 630], 300, 30)).toBe(-1);
  });

  it("still reports right at the edge of a gap", () => {
    // Within the channel's own cadence tolerance of a real sample, so there *is*
    // a reading worth calling this instant's - the gap starts further along.
    expect(sampleIndexAt([0, 10, 20, 620, 630], 45, 30)).toBe(2);
  });

  it("is -1 for an empty series", () => {
    expect(sampleIndexAt([], 10, 30)).toBe(-1);
  });

  it("refuses across a two-sample ceiling, where the threshold is infinite", () => {
    // The regression this guard was silently failing. `gapThreshold` answers
    // `Infinity` below three samples - right for segmenting, and a tolerance of
    // "no distance is too far" for the readout, which turned this straight back
    // into the clamping `nearestSampleIndex`. A dive that tips into deco for two
    // 10-second samples produces exactly this series, so the crosshair reported
    // that ceiling at every instant of the dive.
    const ceilingT = [730, 800];

    expect(gapThreshold(ceilingT)).toBe(Number.POSITIVE_INFINITY);
    expect(readoutTolerance(ceilingT)).toBe(MIN_GAP_SECONDS);
    expect(sampleIndexAt(ceilingT, 300, readoutTolerance(ceilingT))).toBe(-1);
    expect(sampleIndexAt(ceilingT, 4000, readoutTolerance(ceilingT))).toBe(-1);
    expect(sampleIndexAt(ceilingT, 735, readoutTolerance(ceilingT))).toBe(0);
  });

  it("refuses across a one-sample ceiling, which draws nothing at all", () => {
    // Worse than the two-sample case: the single-point run draws no line and no
    // area, so the chart showed no ceiling while the tooltip insisted on one.
    const ceilingT = [730];

    expect(segmentByTimeGap(ceilingT, gapThreshold(ceilingT))).toEqual([[0]]);
    expect(sampleIndexAt(ceilingT, 60, readoutTolerance(ceilingT))).toBe(-1);
  });

  it("leaves an unbroken series alone", () => {
    // The regular case: a 10 s cadence gives a 30 s threshold, so every instant
    // in the dive resolves, and this changes nothing about what was already
    // being reported.
    const t = [0, 10, 20, 30, 40];
    const threshold = gapThreshold(t);

    expect(
      t.map((_, index) => sampleIndexAt(t, index * 10 + 3, threshold)),
    ).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("drawnSampleIndexAt", () => {
  const all = (t: number[]) => new Set(t.map((_, index) => index));

  it("matches sampleIndexAt when every sample was drawn", () => {
    const t = [0, 10, 20, 30];

    expect(drawnSampleIndexAt(t, 21, 30, all(t))).toBe(2);
    expect(drawnSampleIndexAt(t, 300, 30, all(t))).toBe(-1);
  });

  it("skips past a nearer undrawn sample to a drawn one in reach", () => {
    // The masking case. 1060 is the nearest to 1045 and was dropped as an
    // isolated run; 1020 is 25 s away, inside the 30 s tolerance, and drawn.
    // Rejecting the nearest outright reported nothing at all.
    const t = [1000, 1010, 1020, 1060];

    expect(drawnSampleIndexAt(t, 1045, 30, new Set([0, 1, 2]))).toBe(2);
  });

  it("still refuses when the nearest drawn sample is out of reach", () => {
    const t = [1000, 1010, 1020, 1060];

    // 1020 is 60 s away now - past the tolerance - and 1060 is undrawn.
    expect(drawnSampleIndexAt(t, 1080, 30, new Set([0, 1, 2]))).toBe(-1);
  });

  it("searches both directions", () => {
    const t = [0, 100, 200];

    // Only the last sample was drawn; hovering just before the middle one has
    // to reach forward past it.
    expect(drawnSampleIndexAt(t, 190, 30, new Set([2]))).toBe(2);
    // And backward.
    expect(drawnSampleIndexAt(t, 110, 30, new Set([0]))).toBe(-1);
  });

  it("is -1 when nothing was drawn at all", () => {
    expect(drawnSampleIndexAt([0, 10], 5, 30, new Set())).toBe(-1);
  });

  it("is -1 for an empty series", () => {
    expect(drawnSampleIndexAt([], 10, 30, new Set())).toBe(-1);
  });
});

describe("PROFILE_CHANNELS gap semantics", () => {
  it("treats gaps as meaningful only on the ceiling", () => {
    // What decides whether a channel refuses to join two distant samples. On the
    // ceiling a gap means no obligation existed; everywhere else it means the
    // sensor recorded nothing, and joining is the only honest option left when
    // there are too few samples to derive a cadence.
    const meaningful = Object.values(PROFILE_CHANNELS)
      .filter((channel) => channel.gapsAreMeaningful)
      .map((channel) => channel.key);

    expect(meaningful).toEqual(["ceiling"]);
  });
});

describe("describeEvent", () => {
  it("names the cylinder a switch went to", () => {
    expect(describeEvent(event({ type: "gas_switch", gas_number: 1 }))).toBe(
      "Gas switch to gas 1",
    );
  });

  it("treats gas 0 as a real cylinder", () => {
    // A Suunto Ocean numbers its cylinders from zero, so a falsiness check here
    // would drop the number off every switch to the back gas on that computer.
    expect(describeEvent(event({ type: "gas_switch", gas_number: 0 }))).toBe(
      "Gas switch to gas 0",
    );
  });

  it("says only that a switch happened when the file didn't say to what", () => {
    expect(describeEvent(event({ type: "gas_switch" }))).toBe("Gas switch");
    expect(describeEvent(event({ type: "gas_switch", gas_number: null }))).toBe(
      "Gas switch",
    );
  });

  it("spells out the types that speak for themselves", () => {
    expect(describeEvent(event({ type: "deep_stop" }))).toBe("Deep stop");
    expect(describeEvent(event({ type: "safety_stop" }))).toBe("Safety stop");
    expect(describeEvent(event({ type: "bookmark" }))).toBe("Bookmark");
  });

  it("passes a device's own wording through unchanged", () => {
    expect(
      describeEvent(event({ type: "other", label: "Mandatory Safety Stop" })),
    ).toBe("Mandatory Safety Stop");
  });

  it("survives a type this build has never heard of", () => {
    // The API's `ProfileEventType` is closed today and the two repos deploy
    // independently, so a sixth type reaches this bundle as a string TypeScript
    // was told is one of five. Without the `default` the switch fell off the end
    // and returned `undefined` from a function typed `: string`.
    const rogue = {
      t: 10,
      type: "ndl_violation",
      label: "NDL Violation",
    } as unknown as DiveProfileEvent;

    expect(describeEvent(rogue)).toBe("NDL Violation");
    expect(
      describeEvent({
        t: 10,
        type: "ndl_violation",
      } as unknown as DiveProfileEvent),
    ).toBe("Device event");
  });

  it("falls back for an `other` the API should never have sent", () => {
    // `_validate_events` rejects an unlabelled `other` server-side, so this is
    // only reachable through a broken payload - where a neutral word beats the
    // string "undefined" on a chart.
    expect(describeEvent(event({ type: "other" }))).toBe("Device event");
    expect(describeEvent(event({ type: "other", label: "  " }))).toBe(
      "Device event",
    );
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
    expect(tooltipVerticalAnchor(TOP, TOP, BOTTOM).translateY).toContain(
      "-100%",
    );
    expect(tooltipVerticalAnchor(BOTTOM, TOP, BOTTOM).translateY).not.toContain(
      "-100%",
    );
  });

  it("survives a zero-height plot rather than dividing by zero", () => {
    expect(tooltipVerticalAnchor(14, 14, 14).y).toBe(14);
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
