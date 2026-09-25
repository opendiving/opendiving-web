import { describe, expect, it } from "vitest";
import type { DiveProfile, DiveProfileEvent } from "@/lib/api/dives";
import {
  MIN_GAP_MS,
  PROFILE_CHANNEL_KEYS,
  type ProfileChannelKey,
  axisDomain,
  axisUnitSuffix,
  channelWord,
  channelsOnAxis,
  depthDomain,
  displayChannel,
  describeEvent,
  drawnSampleIndexAt,
  elapsedTicks,
  formatChannelValue,
  formatElapsed,
  formatElapsedSpoken,
  gapThreshold,
  nearestEvent,
  nearestSampleIndex,
  readoutTolerance,
  sampleIndexAt,
  segmentByTimeGap,
  toChannelSeries,
  toPressureSeries,
  tooltipVerticalAnchor,
  profileScalePlacement,
  PROFILE_CHANNELS,
} from "@/lib/dive-profile";
import { niceDomain } from "@/lib/chart-scale";

// Every time in this file is on the profile's own axis, milliseconds - so a
// 10-second cadence is `10_000` apart, as the API serves it.
function profile(overrides: Partial<DiveProfile> = {}): DiveProfile {
  return {
    duration: 30_000,
    depth: {
      times: [0, 10_000, 20_000, 30_000],
      values: [139, 372, 632, 88],
    },
    temperature: {
      times: [0, 10_000, 20_000, 30_000],
      values: [219, 219, 218, 220],
    },
    pressures: [{ gas_number: 1, times: [0, 10_000], values: [2052, 2041] }],
    events: [],
    ...overrides,
  };
}

function event(overrides: Partial<DiveProfileEvent> = {}): DiveProfileEvent {
  return { time: 0, type: "gas_switch", ...overrides };
}

describe("toChannelSeries", () => {
  it("divides by the channel's scale exactly", () => {
    const series = toChannelSeries(profile(), "depth", "metric");

    // 139 cm is 1.39 m. `139 * 0.01` is 1.3900000000000001, which is why the
    // implementation divides.
    expect(series?.values).toEqual([1.39, 3.72, 6.32, 0.88]);
  });

  it("converts tenths of a degree without floating-point noise", () => {
    const series = toChannelSeries(
      profile({ temperature: { times: [0], values: [206] } }),
      "temperature",
      "metric",
    );

    expect(series?.values).toEqual([20.6]);
  });

  it("returns null for a channel the profile doesn't carry", () => {
    expect(
      toChannelSeries(profile({ temperature: null }), "temperature", "metric"),
    ).toBeNull();
  });

  it("returns null for an empty channel rather than an empty series", () => {
    expect(
      toChannelSeries(
        profile({ depth: { times: [], values: [] } }),
        "depth",
        "metric",
      ),
    ).toBeNull();
  });

  it("carries the channel definition through", () => {
    expect(
      toChannelSeries(profile(), "depth", "metric")?.channel.inverted,
    ).toBe(true);
    expect(
      toChannelSeries(profile(), "temperature", "metric")?.channel.inverted,
    ).toBe(false);
  });
});

describe("toPressureSeries", () => {
  it("keeps each cylinder separate and labelled by its gas number", () => {
    const series = toPressureSeries(
      profile({
        pressures: [
          { gas_number: 0, times: [0, 10_000], values: [2074, 2051] },
          { gas_number: 3, times: [0], values: [1500] },
        ],
      }),
      "metric",
    );

    expect(series.map((entry) => entry.gasNumber)).toEqual([0, 3]);
    expect(series[0].values).toEqual([207.4, 205.1]);
  });

  it("is an empty list when no transmitter recorded anything", () => {
    expect(toPressureSeries(profile({ pressures: [] }), "metric")).toEqual([]);
  });
});

describe("toChannelSeries for the ceiling", () => {
  it("divides by depth's scale, not one of its own", () => {
    // 300 cm is a 3.0 m ceiling - the commonest stop depth there is, and it has
    // to come out as the same number a 300 cm *depth* would.
    const ceiling = toChannelSeries(
      profile({ ceiling: { times: [730_000, 940_000], values: [300, 323] } }),
      "ceiling",
      "metric",
    );

    expect(ceiling?.values).toEqual([3, 3.23]);
    expect(ceiling?.channel.scale).toBe(PROFILE_CHANNELS.depth.scale);
  });

  it("is null on a dive that owed no decompression", () => {
    expect(toChannelSeries(profile(), "ceiling", "metric")).toBeNull();
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

describe("axisDomain", () => {
  // Not invented numbers: across a 79-dive corpus of Suunto Ocean exports the
  // surface gradient factor peaks at 173, and four dives report a `gf99` that
  // violates an inequality no decompression model can violate, reaching 14 060.
  // DECISIONS.md, *"The percent axis stops at 200 %"*, carries the evidence.
  const SUUNTO_GF99_PEAK = 14060;

  it("fits an unbounded axis to its readings, as it always did", () => {
    // A time to surface of 900 minutes is a device saying something strange and
    // not a fault this chart can name, so nothing caps it: the only axis carrying
    // a bound is the one whose channels have a known way of being wrong.
    expect(axisDomain("duration", [0, 18, 900])).toEqual(
      niceDomain([0, 18, 900]),
    );
  });

  it("leaves a percent axis alone while its readings fit under the bound", () => {
    // The 75 clean dives of the corpus, where the highest surface gradient factor
    // is 121. Nothing about those charts changes.
    const readings = [0, 30, 84, 121];

    expect(axisDomain("percent", readings)).toEqual(niceDomain(readings));
    expect(axisDomain("percent", readings).max).toBeLessThan(200);
  });

  it("stops a percent axis at 200 % however high the reading goes", () => {
    expect(axisDomain("percent", [0, 170, SUUNTO_GF99_PEAK])).toEqual({
      min: 0,
      max: 200,
      step: 50,
    });
  });

  it("draws the same 200 % band whatever the overrun is", () => {
    // What a percentile rule cannot promise: on the worst dive the 99th still
    // yields 2 000 and the 95th yields 400, so adjacent dives would be drawn
    // against different scales with nothing on screen to say so.
    expect(axisDomain("percent", [0, 170, 400])).toEqual(
      axisDomain("percent", [0, 170, SUUNTO_GF99_PEAK]),
    );
  });

  it("still gives a band when every reading is above the bound", () => {
    // Degenerate, and reachable: a row carrying only a gradient factor whose
    // whole drawn run overran. `niceDomain` on a zero-height range would hand
    // back a 199-to-201 sliver.
    expect(axisDomain("percent", [732, SUUNTO_GF99_PEAK])).toEqual({
      min: 0,
      max: 200,
      step: 50,
    });
  });

  it("bounds the axis and not the reading", () => {
    // The property the whole change is for: nothing here touches the values it
    // was handed. Stated as a test because the temptation is to clamp, which
    // DiveJSON §5.4 forbids and which would launder a device fault into a
    // plausible number.
    const values = [0, 170, SUUNTO_GF99_PEAK];
    axisDomain("percent", values);

    expect(values).toEqual([0, 170, SUUNTO_GF99_PEAK]);
  });
});

describe("nearestEvent", () => {
  const events = [
    event({ time: 0, type: "gas_switch", gas_number: 0 }),
    event({ time: 497_000, type: null, label: "NoDecoTime" }),
    event({ time: 2_075_000, type: "gas_switch", gas_number: 1 }),
  ];

  it("finds the closest marker within the tolerance", () => {
    expect(nearestEvent(events, 480_000, 40_000)?.label).toBe("NoDecoTime");
  });

  it("returns null when the nearest marker is out of reach", () => {
    // 1 200 s from either neighbour: the crosshair is nowhere near a marker, and
    // naming one anyway would caption something that isn't under it.
    expect(nearestEvent(events, 1_280_000, 40_000)).toBeNull();
  });

  it("prefers the nearer of two markers on either side", () => {
    expect(nearestEvent(events, 300_000, 600_000)?.time).toBe(497_000);
    expect(nearestEvent(events, 200_000, 600_000)?.time).toBe(0);
  });

  it("gives a tie to the earlier marker, whatever order it arrived in", () => {
    const early = event({ time: 100_000 });
    const late = event({ time: 200_000 });

    expect(nearestEvent([early, late], 150_000, 60_000)?.time).toBe(100_000);
    // The half that array order alone would get wrong: the later marker is
    // listed first, and "earlier event" has to mean earlier in time.
    expect(nearestEvent([late, early], 150_000, 60_000)?.time).toBe(100_000);
  });

  it("does not assume the list arrived sorted", () => {
    const unsorted = [
      event({ time: 900_000 }),
      event({ time: 60_000 }),
      event({ time: 400_000 }),
    ];

    expect(nearestEvent(unsorted, 70_000, 30_000)?.time).toBe(60_000);
  });

  it("is null on a dive with no markers", () => {
    expect(nearestEvent([], 100_000, 60_000)).toBeNull();
  });

  it("includes a marker exactly at the tolerance, to the millisecond", () => {
    const marker = [event({ time: 100_000 })];

    expect(nearestEvent(marker, 160_000, 60_000)?.time).toBe(100_000);
    expect(nearestEvent(marker, 160_001, 60_000)).toBeNull();
  });
});

describe("sampleIndexAt", () => {
  it("is the nearest sample when there is one close enough", () => {
    expect(sampleIndexAt([0, 10_000, 20_000, 30_000], 21_000, 30_000)).toBe(2);
  });

  it("refuses to quote a reading from before a channel started", () => {
    // The ceiling case, and the reason this function exists. A deco ceiling that
    // begins at 730 s says nothing about the dive at 300 s - the diver owed no
    // decompression then, and clamping to the first sample would report a 3.0 m
    // ceiling they were never held to.
    const ceilingT = [730_000, 800_000, 810_000, 820_000];

    expect(sampleIndexAt(ceilingT, 300_000, gapThreshold(ceilingT))).toBe(-1);
    expect(sampleIndexAt(ceilingT, 735_000, gapThreshold(ceilingT))).toBe(0);
  });

  it("refuses inside a dropout, where no line is drawn either", () => {
    // A transmitter silent from 20 s to 620 s. Mid-dropout there is nothing
    // honest to report, and the polyline is broken across exactly this stretch.
    expect(
      sampleIndexAt([0, 10_000, 20_000, 620_000, 630_000], 300_000, 30_000),
    ).toBe(-1);
  });

  it("still reports right at the edge of a gap", () => {
    // Within the channel's own cadence tolerance of a real sample, so there *is*
    // a reading worth calling this instant's - the gap starts further along.
    expect(
      sampleIndexAt([0, 10_000, 20_000, 620_000, 630_000], 45_000, 30_000),
    ).toBe(2);
  });

  it("is -1 for an empty series", () => {
    expect(sampleIndexAt([], 10_000, 30_000)).toBe(-1);
  });

  it("refuses across a two-sample ceiling, where the threshold is infinite", () => {
    // The regression this guard was silently failing. `gapThreshold` answers
    // `Infinity` below three samples - right for segmenting, and a tolerance of
    // "no distance is too far" for the readout, which turned this straight back
    // into the clamping `nearestSampleIndex`. A dive that tips into deco for two
    // 10-second samples produces exactly this series, so the crosshair reported
    // that ceiling at every instant of the dive.
    const ceilingT = [730_000, 800_000];
    const tolerance = readoutTolerance(ceilingT);

    expect(gapThreshold(ceilingT)).toBe(Number.POSITIVE_INFINITY);
    expect(tolerance).toBe(MIN_GAP_MS);
    expect(sampleIndexAt(ceilingT, 300_000, tolerance)).toBe(-1);
    expect(sampleIndexAt(ceilingT, 4_000_000, tolerance)).toBe(-1);
    expect(sampleIndexAt(ceilingT, 735_000, tolerance)).toBe(0);
  });

  it("refuses across a one-sample ceiling, which draws nothing at all", () => {
    // Worse than the two-sample case: the single-point run draws no line and no
    // area, so the chart showed no ceiling while the tooltip insisted on one.
    const ceilingT = [730_000];

    expect(segmentByTimeGap(ceilingT, gapThreshold(ceilingT))).toEqual([[0]]);
    expect(sampleIndexAt(ceilingT, 60_000, readoutTolerance(ceilingT))).toBe(
      -1,
    );
  });

  it("leaves an unbroken series alone", () => {
    // The regular case: a 10 s cadence gives a 30 s threshold, so every instant
    // in the dive resolves, and this changes nothing about what was already
    // being reported.
    const t = [0, 10_000, 20_000, 30_000, 40_000];
    const threshold = gapThreshold(t);

    expect(
      t.map((_, index) => sampleIndexAt(t, index * 10_000 + 3_000, threshold)),
    ).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("drawnSampleIndexAt", () => {
  const all = (t: number[]) => new Set(t.map((_, index) => index));

  it("matches sampleIndexAt when every sample was drawn", () => {
    const t = [0, 10_000, 20_000, 30_000];

    expect(drawnSampleIndexAt(t, 21_000, 30_000, all(t))).toBe(2);
    expect(drawnSampleIndexAt(t, 300_000, 30_000, all(t))).toBe(-1);
  });

  it("skips past a nearer undrawn sample to a drawn one in reach", () => {
    // The masking case. 1060 s is the nearest to 1045 s and was dropped as an
    // isolated run; 1020 s is 25 s away, inside the 30 s tolerance, and drawn.
    // Rejecting the nearest outright reported nothing at all.
    const t = [1_000_000, 1_010_000, 1_020_000, 1_060_000];

    expect(drawnSampleIndexAt(t, 1_045_000, 30_000, new Set([0, 1, 2]))).toBe(
      2,
    );
  });

  it("still refuses when the nearest drawn sample is out of reach", () => {
    const t = [1_000_000, 1_010_000, 1_020_000, 1_060_000];

    // 1020 s is 60 s away now - past the tolerance - and 1060 s is undrawn.
    expect(drawnSampleIndexAt(t, 1_080_000, 30_000, new Set([0, 1, 2]))).toBe(
      -1,
    );
  });

  it("searches both directions", () => {
    const t = [0, 100_000, 200_000];

    // Only the last sample was drawn; hovering just before the middle one has
    // to reach forward past it.
    expect(drawnSampleIndexAt(t, 190_000, 30_000, new Set([2]))).toBe(2);
    // And backward.
    expect(drawnSampleIndexAt(t, 110_000, 30_000, new Set([0]))).toBe(-1);
  });

  it("is -1 when nothing was drawn at all", () => {
    expect(drawnSampleIndexAt([0, 10_000], 5_000, 30_000, new Set())).toBe(-1);
  });

  it("is -1 for an empty series", () => {
    expect(drawnSampleIndexAt([], 10_000, 30_000, new Set())).toBe(-1);
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

  it("names every alarm class the API can send", () => {
    // One value per distinct meaning, not one per vendor string: the device's
    // own spelling travels in `label` and the chart says what happened.
    expect(describeEvent(event({ type: "ascent_rate" }))).toBe("Ascent rate");
    expect(describeEvent(event({ type: "safety_stop_mandatory" }))).toBe(
      "Mandatory safety stop",
    );
    expect(describeEvent(event({ type: "safety_stop_violation" }))).toBe(
      "Safety stop broken",
    );
    expect(describeEvent(event({ type: "deep_stop_violation" }))).toBe(
      "Deep stop broken",
    );
    expect(describeEvent(event({ type: "ceiling_violation" }))).toBe(
      "Deco ceiling broken",
    );
    expect(describeEvent(event({ type: "ndl_reached" }))).toBe(
      "No-deco limit reached",
    );
    expect(describeEvent(event({ type: "ppo2_high" }))).toBe("ppO\u2082 high");
    expect(describeEvent(event({ type: "pressure_low" }))).toBe(
      "Tank pressure low",
    );
    expect(describeEvent(event({ type: "depth_alarm" }))).toBe("Depth alarm");
  });

  it("passes a device's own wording through where there is no type", () => {
    // Which is what an absent type *means*: the device recorded something this
    // vocabulary has no word for, and rephrasing it would invent a claim about
    // a dive.
    expect(
      describeEvent(event({ type: null, label: "Mandatory Safety Stop" })),
    ).toBe("Mandatory Safety Stop");
    expect(describeEvent({ time: 10, label: "Violated Deep Stop" })).toBe(
      "Violated Deep Stop",
    );
  });

  it("treats an older build's `other` as the unclassified it meant", () => {
    // The API dropped `other` from the wire when DiveJSON made `type` optional.
    // The two repos deploy independently, so a payload still carrying the string
    // reaches this bundle - and it lands on the same `default` an unknown type
    // does, which is the right answer rather than a lucky one.
    expect(
      describeEvent({
        time: 10,
        type: "other",
        label: "Ceiling Broken",
      } as unknown as DiveProfileEvent),
    ).toBe("Ceiling Broken");
  });

  it("survives a type this build has never heard of", () => {
    // The API's `ProfileEventType` is closed today and the two repos deploy
    // independently, so a fourteenth type reaches this bundle as a string
    // TypeScript was told is one of thirteen. Without the `default` the switch
    // fell off the end and returned `undefined` from a function typed `: string`.
    const rogue = {
      time: 10,
      type: "setpoint_change",
      label: "Setpoint Change",
    } as unknown as DiveProfileEvent;

    expect(describeEvent(rogue)).toBe("Setpoint Change");
    expect(
      describeEvent({
        time: 10,
        type: "setpoint_change",
      } as unknown as DiveProfileEvent),
    ).toBe("Device event");
  });

  it("falls back for an unlabelled marker the API should never have sent", () => {
    // `_validate_events` rejects a typeless event with no label server-side, so
    // this is only reachable through a broken payload - where a neutral word
    // beats the string "undefined" on a chart.
    expect(describeEvent(event({ type: null }))).toBe("Device event");
    expect(describeEvent(event({ type: null, label: "  " }))).toBe(
      "Device event",
    );
  });
});

describe("segmentByTimeGap", () => {
  it("returns one run for an unbroken series", () => {
    expect(segmentByTimeGap([0, 10_000, 20_000, 30_000], 30_000)).toEqual([
      [0, 1, 2, 3],
    ]);
  });

  it("breaks where the gap exceeds the threshold", () => {
    // A transmitter that stopped reporting between 20 s and 620 s.
    expect(
      segmentByTimeGap([0, 10_000, 20_000, 620_000, 630_000], 30_000),
    ).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
  });

  it("does not break on a gap exactly at the threshold", () => {
    expect(segmentByTimeGap([0, 30_000, 60_000], 30_000)).toEqual([[0, 1, 2]]);
  });

  it("handles an empty series", () => {
    expect(segmentByTimeGap([], 30_000)).toEqual([]);
  });

  it("handles a single sample", () => {
    expect(segmentByTimeGap([42_000], 30_000)).toEqual([[0]]);
  });
});

describe("gapThreshold", () => {
  it("scales with a series' own cadence", () => {
    // 10 s cadence (every Suunto depth series) -> 30 s.
    expect(gapThreshold([0, 10_000, 20_000, 30_000, 40_000])).toBe(30_000);
  });

  it("never drops below the floor on a fast series", () => {
    // 1 Hz temperature would otherwise break on the jitter in its own stamps.
    expect(gapThreshold([0, 1_000, 2_000, 3_000, 4_000])).toBe(MIN_GAP_MS);
    expect(MIN_GAP_MS).toBe(15_000);
  });

  it("keeps a sub-second cadence's line whole", () => {
    // A freediving computer logging four times a second: its median delta is
    // 250 ms, so three times it would break the line on any 750 ms hiccup. The
    // floor keeps it whole.
    const t = [0, 250, 500, 750, 1_000, 2_000, 2_250];

    expect(gapThreshold(t)).toBe(MIN_GAP_MS);
    expect(segmentByTimeGap(t, gapThreshold(t))).toHaveLength(1);
  });

  it("ignores a lone outlying gap when picking the threshold", () => {
    // The median delta is 10 s despite the 600 s dropout, so the dropout is
    // above the threshold and gets broken - which is the point.
    const t = [0, 10_000, 20_000, 620_000, 630_000, 640_000];
    expect(gapThreshold(t)).toBe(30_000);
    expect(segmentByTimeGap(t, gapThreshold(t))).toHaveLength(2);
  });

  it("never breaks a series too short to have a cadence", () => {
    const t = [0, 10_000];

    expect(gapThreshold(t)).toBe(Number.POSITIVE_INFINITY);
    expect(segmentByTimeGap(t, gapThreshold(t))).toEqual([[0, 1]]);
  });
});

describe("nearestSampleIndex", () => {
  const t = [0, 10_000, 20_000, 30_000, 40_000];

  it("finds an exact hit", () => {
    expect(nearestSampleIndex(t, 20_000)).toBe(2);
  });

  it("rounds a midpoint to the earlier sample", () => {
    expect(nearestSampleIndex(t, 15_000)).toBe(1);
  });

  it("picks the nearer neighbour", () => {
    expect(nearestSampleIndex(t, 16_000)).toBe(2);
    expect(nearestSampleIndex(t, 14_000)).toBe(1);
  });

  it("resolves the millisecond either side of a midpoint", () => {
    expect(nearestSampleIndex(t, 15_001)).toBe(2);
    expect(nearestSampleIndex(t, 14_999)).toBe(1);
  });

  it("clamps before the first sample", () => {
    expect(nearestSampleIndex(t, -100_000)).toBe(0);
  });

  it("clamps after the last sample", () => {
    expect(nearestSampleIndex(t, 10_000_000)).toBe(4);
  });

  it("handles a single sample", () => {
    expect(nearestSampleIndex([7_000], 0)).toBe(0);
    expect(nearestSampleIndex([7_000], 700_000)).toBe(0);
  });

  it("handles an empty series", () => {
    expect(nearestSampleIndex([], 10_000)).toBe(-1);
  });

  it("works on an irregularly spaced series", () => {
    // What a downsampled channel looks like: bucketed, so unevenly spaced.
    const irregular = [0, 3_000, 47_000, 48_000, 900_000];
    expect(nearestSampleIndex(irregular, 46_000)).toBe(2);
    expect(nearestSampleIndex(irregular, 400_000)).toBe(3);
    expect(nearestSampleIndex(irregular, 500_000)).toBe(4);
  });
});

describe("elapsedTicks", () => {
  const MINUTE = 60_000;

  it("gives round minutes for a short dive", () => {
    // 12 minutes -> every 2.
    expect(elapsedTicks(12 * MINUTE)).toEqual(
      [0, 2, 4, 6, 8, 10, 12].map((minutes) => minutes * MINUTE),
    );
  });

  it("gives round minutes for a typical dive", () => {
    // 50 minutes -> a 10-minute step, not 8m20s.
    expect(elapsedTicks(50 * MINUTE)).toEqual(
      [0, 10, 20, 30, 40, 50].map((minutes) => minutes * MINUTE),
    );
  });

  it("gives round minutes for a long dive", () => {
    // 3 hours -> half-hourly.
    expect(elapsedTicks(180 * MINUTE)).toEqual(
      [0, 30, 60, 90, 120, 150, 180].map((minutes) => minutes * MINUTE),
    );
  });

  it("never runs past the end of the dive", () => {
    const ticks = elapsedTicks(2_781_000);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(2_781_000);
  });

  it("every tick is a whole number of minutes", () => {
    for (const duration of [
      720_000, 2_781_000, 3_000_000, 4_401_160, 10_800_000,
    ]) {
      for (const tick of elapsedTicks(duration)) {
        expect(tick % MINUTE).toBe(0);
      }
    }
  });

  it("survives a zero-length profile", () => {
    expect(elapsedTicks(0)).toEqual([0]);
  });

  it("holds a short axis's target past the longest candidate step", () => {
    // Twelve hours on a phone's four: the two-hour step would draw seven.
    expect(elapsedTicks(720 * MINUTE, 4)).toEqual(
      [0, 240, 480, 720].map((minutes) => minutes * MINUTE),
    );
  });
});

describe("formatElapsed", () => {
  it("reads an axis instant as minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(600_000)).toBe("10:00");
    expect(formatElapsed(4_000_020)).toBe("66:40");
  });

  it("rounds to the nearest second rather than printing milliseconds", () => {
    // The first depth of `suunto-ocean.json` sits 160 ms after its header, and
    // an `M:SS` label has no place to put that.
    expect(formatElapsed(160)).toBe("0:00");
    expect(formatElapsed(1_600)).toBe("0:02");
  });
});

describe("formatElapsedSpoken", () => {
  it("reads a span aloud in hours and minutes", () => {
    expect(formatElapsedSpoken(1_500_000)).toBe("25min");
    expect(formatElapsedSpoken(5_100_000)).toBe("1h 25min");
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

describe("the imperial display layer", () => {
  // Converted after the wire scale is divided out, never by editing `scale` -
  // that number is a pair with `schemas/dive_profile.py` and describes the API's
  // integer encoding, not the diver's units.
  it("converts the series and relabels its channel", () => {
    const series = toChannelSeries(profile(), "depth", "imperial");

    expect(series?.channel.unit).toBe("ft");
    expect(series?.channel.decimals).toBe(0);
    expect(series?.values[0]).toBeCloseTo(139 / 100 / 0.3048, 10);
  });

  it("converts pressure into psi", () => {
    const series = toPressureSeries(
      profile({
        pressures: [{ gas_number: 1, times: [0], values: [2000] }],
      }),
      "imperial",
    );

    expect(series[0].channel.unit).toBe("psi");
    expect(series[0].values[0]).toBeCloseTo(200 * 14.503773773020923, 8);
  });

  // Depth and the ceiling share one conversion for the same reason they share one
  // `scale` and one domain: a shaded deco region converted by any other factor
  // would drift off the curve it bounds.
  it("converts the ceiling exactly as it converts depth", () => {
    const withCeiling = profile({
      depth: { times: [0], values: [3048] },
      ceiling: { times: [0], values: [3048] },
    });

    expect(toChannelSeries(withCeiling, "ceiling", "imperial")?.values).toEqual(
      toChannelSeries(withCeiling, "depth", "imperial")?.values,
    );
  });

  it("names the spoken unit for a screen reader", () => {
    expect(channelWord("depth", "imperial")).toBe("feet");
    expect(channelWord("ceiling", "imperial")).toBe("feet");
    expect(channelWord("temperature", "imperial")).toBe("degrees Fahrenheit");
    expect(channelWord("pressure", "imperial")).toBe("psi");
  });

  it("quotes a converted reading whole, with the unit attached where it belongs", () => {
    const channel = displayChannel(PROFILE_CHANNELS.temperature, "imperial");

    expect(formatChannelValue(75.2, channel)).toBe("75°F");
    expect(
      formatChannelValue(
        100,
        displayChannel(PROFILE_CHANNELS.depth, "imperial"),
      ),
    ).toBe("100 ft");
  });
});

describe("formatChannelValue", () => {
  it("shows each channel at the resolution it was stored in", () => {
    expect(formatChannelValue(16.9, PROFILE_CHANNELS.depth)).toBe("16.9 m");
    // Attached, not spaced. This was the app's one spaced degree symbol before
    // `unitSeparator` became the single answer to that question.
    expect(formatChannelValue(21.62, PROFILE_CHANNELS.temperature)).toBe(
      "21.6°C",
    );
    expect(formatChannelValue(205.2, PROFILE_CHANNELS.pressure)).toBe(
      "205 bar",
    );
  });
});

describe("the deco channels", () => {
  // Every one of the six, from a profile carrying all of them at the scales the
  // API serves. The numbers here are the wire's integers, so the assertions are
  // the whole of the contract between `schemas/dive_profile.py` and this chart.
  const deco = profile({
    ndl: { times: [0, 60_000], values: [5940, 0] },
    tts: { times: [0, 60_000], values: [0, 1080] },
    ppo2: { times: [0, 60_000], values: [21, 132] },
    cns: { times: [0, 60_000], values: [0, 234] },
    gradient_factor: { times: [0, 60_000], values: [0, 12575] },
    surface_gradient_factor: { times: [0, 60_000], values: [0, 87] },
  });

  it("reads a no-deco time in minutes, not in the seconds it arrives as", () => {
    // 5 940 s is 99 minutes - a Shearwater's display maximum, which is a reading
    // rather than a sentinel and is carried as one. Seconds still, on an axis
    // that is milliseconds: a value is a reading, not a position on the axis.
    expect(toChannelSeries(deco, "ndl", "metric")?.values).toEqual([99, 0]);
    expect(toChannelSeries(deco, "tts", "metric")?.values).toEqual([0, 18]);
  });

  it("divides ppO₂ by hundredths and CNS by tenths", () => {
    expect(toChannelSeries(deco, "ppo2", "metric")?.values).toEqual([
      0.21, 1.32,
    ]);
    expect(toChannelSeries(deco, "cns", "metric")?.values).toEqual([0, 23.4]);
  });

  it("leaves a gradient factor exactly as the device wrote it", () => {
    // A Suunto Ocean's `gf99` reaches five figures on a decompression ascent.
    // Clamping it would be a guess wearing a plausible number, so nothing between
    // the wire and the readout touches it. The percent *axis* stops at 200 % and
    // the curve is drawn leaving the row - see `axisDomain` above, which is the
    // half of this that is allowed to be bounded.
    expect(toChannelSeries(deco, "gradient_factor", "metric")?.values).toEqual([
      0, 12575,
    ]);
    expect(
      toChannelSeries(deco, "surface_gradient_factor", "metric")?.values,
    ).toEqual([0, 87]);
  });

  it("reads the same in imperial, because none of the six converts", () => {
    // `lib/units.ts` names ppO₂, CNS and duration as deliberately absent from
    // `Dimension`, and a percent is a percent - so a diver reading in feet and
    // psi sees these six unchanged, labels included.
    for (const key of [
      "ndl",
      "tts",
      "ppo2",
      "cns",
      "gradient_factor",
      "surface_gradient_factor",
    ] as const) {
      expect(toChannelSeries(deco, key, "imperial")?.values).toEqual(
        toChannelSeries(deco, key, "metric")?.values,
      );
      expect(displayChannel(PROFILE_CHANNELS[key], "imperial")).toEqual(
        PROFILE_CHANNELS[key],
      );
    }
  });

  it("formats each with the spacing its unit is written with", () => {
    expect(formatChannelValue(18, PROFILE_CHANNELS.tts)).toBe("18 min");
    expect(formatChannelValue(1.32, PROFILE_CHANNELS.ppo2)).toBe("1.32 bar");
    // Attached, like the degree symbol and unlike bar.
    expect(formatChannelValue(23.4, PROFILE_CHANNELS.cns)).toBe("23.4%");
    expect(formatChannelValue(87, PROFILE_CHANNELS.gradient_factor)).toBe(
      "87%",
    );
  });

  it("is spoken in words a screen reader can read aloud", () => {
    expect(channelWord("ndl", "metric")).toBe("minutes");
    expect(channelWord("ppo2", "imperial")).toBe("bar");
    expect(channelWord("cns", "metric")).toBe("percent");
  });

  it("treats a gap as 'not recorded', the way a measured channel does", () => {
    // Only the ceiling's gaps mean something about the dive - a stretch with no
    // obligation. A hole in an NDL series is a device that stopped writing one,
    // so these are not segmented at the readout tolerance and a two-sample
    // channel is still drawn.
    const meaningful = Object.values(PROFILE_CHANNELS)
      .filter((channel) => channel.gapsAreMeaningful)
      .map((channel) => channel.key);

    expect(meaningful).toEqual(["ceiling"]);
  });
});

describe("channelsOnAxis", () => {
  it("groups the channels that share one scale", () => {
    expect(channelsOnAxis(PROFILE_CHANNEL_KEYS, "duration")).toEqual([
      "ndl",
      "tts",
    ]);
    expect(channelsOnAxis(PROFILE_CHANNEL_KEYS, "percent")).toEqual([
      "cns",
      "gradient_factor",
      "surface_gradient_factor",
    ]);
    expect(channelsOnAxis(PROFILE_CHANNEL_KEYS, "depth")).toEqual([
      "depth",
      "ceiling",
    ]);
  });

  it("keeps ppO₂ off the tank-pressure scale though both are bar", () => {
    // 1.3 bar of oxygen on a 230-bar tank axis is a flat line along the
    // baseline. The axes are named after the quantity for exactly this reason.
    expect(channelsOnAxis(PROFILE_CHANNEL_KEYS, "ppo2")).toEqual(["ppo2"]);
    expect(channelsOnAxis(PROFILE_CHANNEL_KEYS, "pressure")).toEqual([
      "pressure",
    ]);
  });

  it("answers in the legend's order, and only for what is shown", () => {
    expect(
      channelsOnAxis(["surface_gradient_factor", "cns"], "percent"),
    ).toEqual(["cns", "surface_gradient_factor"]);
  });
});

describe("axisUnitSuffix", () => {
  it("carries the separator as well as the unit", () => {
    expect(axisUnitSuffix("duration", "metric")).toBe(" min");
    expect(axisUnitSuffix("ppo2", "metric")).toBe(" bar");
    expect(axisUnitSuffix("percent", "metric")).toBe("%");
  });

  it("follows the diver's system where the axis has one", () => {
    expect(axisUnitSuffix("depth", "imperial")).toBe(" ft");
    // And does not where it doesn't - the deco panel reads the same either way.
    expect(axisUnitSuffix("percent", "imperial")).toBe("%");
  });
});

describe("profileScalePlacement", () => {
  // Every one of the 1 024 selections of the ten channels. Swept as a pure
  // function rather than by rendering, which is the whole reason the rule lives
  // here: the combination that breaks a ten-input rule is never the obvious one,
  // and 1 024 renders is not a test anybody would keep.
  const EVERY_SELECTION = Array.from(
    { length: 2 ** PROFILE_CHANNEL_KEYS.length },
    (_, mask) => PROFILE_CHANNEL_KEYS.filter((_, index) => mask & (1 << index)),
  );

  // How many distinct scales a selection puts on the *depth plot*. Depth and the
  // ceiling share one domain by construction; temperature and tank pressure each
  // have their own, and nothing else is drawn there.
  const depthPlotScales = (keys: readonly ProfileChannelKey[]) =>
    new Set(
      keys
        .filter((key) =>
          ["depth", "ceiling", "temperature", "pressure"].includes(key),
        )
        .map((key) => (key === "ceiling" ? "depth" : key)),
    ).size;

  it.each(EVERY_SELECTION.map((keys) => [keys.join(" + ") || "nothing", keys]))(
    "labels the depth plot's edges for %s",
    (_, keys) => {
      const placement = profileScalePlacement(
        keys as readonly ProfileChannelKey[],
      );
      const scales = depthPlotScales(keys as readonly ProfileChannelKey[]);

      // The left edge is labelled whenever anything is on the depth plot, and
      // the right exactly when that plot holds a second scale.
      expect(placement.left !== null).toBe(scales > 0);
      expect(placement.right !== null).toBe(scales > 1);
      // And never the same channel twice, which would put one scale on both
      // edges and invite the reading that they are two.
      if (placement.right !== null) {
        expect(placement.right).not.toBe(placement.left);
      }
    },
  );

  it.each(EVERY_SELECTION.map((keys) => [keys.join(" + ") || "nothing", keys]))(
    "gives every deco channel a panel row for %s",
    (_, keys) => {
      const shown = keys as readonly ProfileChannelKey[];
      const placement = profileScalePlacement(shown);

      // No curve is drawn against nothing: every channel the diver switched on
      // either labels an edge of the depth plot or sits in a panel row that
      // carries its own scale.
      for (const key of shown) {
        const housed =
          key === placement.left ||
          key === placement.right ||
          key === "ceiling" ||
          key === "pressure" ||
          placement.panels.some((axis) =>
            channelsOnAxis(shown, axis).includes(key),
          );
        expect(housed).toBe(true);
      }
      // A row exists only where something is on it.
      for (const axis of placement.panels) {
        expect(channelsOnAxis(shown, axis).length).toBeGreaterThan(0);
      }
    },
  );

  it("keeps meters on the left and temperature on the right", () => {
    expect(profileScalePlacement(["depth", "temperature"])).toMatchObject({
      left: "depth",
      right: "temperature",
    });
  });

  it("hands the ceiling depth's own edge when depth is off", () => {
    expect(profileScalePlacement(["ceiling", "temperature"])).toMatchObject({
      left: "ceiling",
      right: "temperature",
    });
  });

  it("moves pressure rather than the other two", () => {
    expect(profileScalePlacement(["depth", "pressure"]).right).toBe("pressure");
    expect(profileScalePlacement(["temperature", "pressure"]).left).toBe(
      "pressure",
    );
    // Three scales, two edges: pressure is the one that goes unlabelled, and the
    // crosshair gives its exact figure for any instant.
    expect(
      profileScalePlacement(["depth", "temperature", "pressure"]),
    ).toMatchObject({ left: "depth", right: "temperature" });
  });

  it("puts a lone scale on the left and leaves the right empty", () => {
    expect(profileScalePlacement(["temperature"])).toMatchObject({
      left: "temperature",
      right: null,
    });
  });

  it("leaves the depth plot's edges alone when only deco channels are on", () => {
    // The panel rows are their own plots with their own left edges, so nothing
    // the diver switches on down there can claim an edge up here.
    expect(profileScalePlacement(["ndl", "cns"])).toEqual({
      left: null,
      right: null,
      panels: ["duration", "percent"],
    });
  });

  it("stacks the rows in one order however the selection was made", () => {
    expect(profileScalePlacement(["cns", "ppo2", "tts"]).panels).toEqual([
      "duration",
      "ppo2",
      "percent",
    ]);
  });

  it("grows no row for an axis nothing is on", () => {
    expect(profileScalePlacement(["depth", "ceiling"]).panels).toEqual([]);
  });
});
