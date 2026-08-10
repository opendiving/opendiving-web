import type {
  DiveProfile,
  DiveProfilePressureSeries,
  DiveProfileSeries,
} from "@/lib/api/dives";

// All of the dive profile chart's arithmetic, kept out of the component per the
// repo convention: pure functions in `lib/` get Vitest coverage, components
// aren't rendered in tests. If a number on that chart could be wrong, its
// derivation belongs here.

export type ProfileChannelKey = "depth" | "temperature" | "pressure";

export interface ProfileChannel {
  key: ProfileChannelKey;
  label: string;
  unit: string;
  // What the API's integer `v` values are divided by to reach display units.
  // Mirrors `DEPTH_SCALE`/`TEMPERATURE_SCALE`/`PRESSURE_SCALE` in the API's
  // `schemas/dive_profile.py` - these two lists are a pair.
  scale: number;
  // How many decimals a reading of this channel is worth showing. Same
  // resolution as the stored scale: showing more digits than were stored is a
  // false claim about the sensor.
  decimals: number;
  // The Tailwind text color class the curve, its axis and its readout all use.
  colorClass: string;
  // Depth grows downward from the surface, so its axis is upside down relative
  // to every other chart in the app. The flag lives here rather than as an `if`
  // in the component, so nothing else has to remember which channel is special.
  inverted: boolean;
}

export const PROFILE_CHANNELS: Record<ProfileChannelKey, ProfileChannel> = {
  depth: {
    key: "depth",
    label: "Depth",
    unit: "m",
    scale: 100, // centimeters
    decimals: 1,
    colorClass: "text-teal",
    inverted: true,
  },
  temperature: {
    key: "temperature",
    label: "Temperature",
    unit: "°C",
    scale: 10, // tenths of a degree
    decimals: 1,
    colorClass: "text-coral",
    inverted: false,
  },
  pressure: {
    key: "pressure",
    label: "Tank pressure",
    unit: "bar",
    scale: 10, // tenths of a bar
    decimals: 0,
    colorClass: "text-pressure",
    inverted: false,
  },
};

export interface ChannelSeries {
  channel: ProfileChannel;
  // Elapsed seconds, as stored.
  t: number[];
  // Display units - `v` divided by the channel's scale.
  values: number[];
}

// A channel's stored integers as display units, or `null` when the profile
// doesn't carry that channel.
//
// Divides, never multiplies by a reciprocal: `1234 / 100` is the correctly
// rounded `12.34`, whereas `1234 * 0.01` is `12.340000000000002` - exactly the
// noise the integer encoding was chosen to remove.
export function toChannelSeries(
  profile: DiveProfile,
  key: "depth" | "temperature",
): ChannelSeries | null {
  const series: DiveProfileSeries | null | undefined = profile[key];
  if (!series || series.t.length === 0) return null;

  const channel = PROFILE_CHANNELS[key];
  return {
    channel,
    t: series.t,
    values: series.v.map((value) => value / channel.scale),
  };
}

// Same, per cylinder. Each cylinder is its own line on the chart, labelled by
// its `gas_number`.
export function toPressureSeries(
  profile: DiveProfile,
): (ChannelSeries & { gasNumber: number })[] {
  const channel = PROFILE_CHANNELS.pressure;
  return (profile.pressure ?? [])
    .filter((cylinder) => cylinder.t.length > 0)
    .map((cylinder: DiveProfilePressureSeries) => ({
      channel,
      gasNumber: cylinder.gas_number,
      t: cylinder.t,
      values: cylinder.v.map((value) => value / channel.scale),
    }));
}

// Split a series into runs of consecutive samples, as arrays of indices, so a
// polyline is never drawn across a gap.
//
// The same lie `segmentByGap` exists to prevent on the gas chart, expressed in
// seconds instead of days: a transmitter that drops out for ten minutes
// mid-dive would otherwise be drawn as a straight line from the last reading to
// the first one after it - which reads as "the pressure fell smoothly" when the
// truth is "nothing was recorded here". Real: 224 of 441 samples on
// `Dive_2025-06-02-1155.xml`.
export function segmentByTimeGap(
  t: number[],
  maxGapSeconds: number,
): number[][] {
  if (t.length === 0) return [];

  const segments: number[][] = [[0]];
  for (let index = 1; index < t.length; index++) {
    if (t[index] - t[index - 1] > maxGapSeconds) {
      segments.push([index]);
    } else {
      segments[segments.length - 1].push(index);
    }
  }
  return segments;
}

// How far apart two samples have to be before the line between them is a lie,
// derived from the series' own cadence rather than fixed.
//
// It has to be derived: cadence varies from 1 s (Suunto Ocean temperature) to
// 10 s (every Suunto depth series), and server-side downsampling stretches it
// further and unevenly. A fixed threshold would either break every downsampled
// line into confetti or draw straight through a real ten-minute dropout. Three
// times the median delta is comfortably above normal jitter and comfortably
// below any dropout worth showing; the floor keeps a perfectly regular series
// from breaking on a one-second rounding wobble.
export const GAP_FACTOR = 3;
export const MIN_GAP_SECONDS = 15;

export function gapThreshold(t: number[]): number {
  if (t.length < 3) return Number.POSITIVE_INFINITY;

  const deltas = t.slice(1).map((time, index) => time - t[index]);
  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];

  return Math.max(MIN_GAP_SECONDS, median * GAP_FACTOR);
}

// The index of the sample nearest `seconds`, by binary search, clamped at both
// ends.
//
// Always a real sample, never an interpolated one: the crosshair readout says
// "21.6 °C at 12:30", and a value the sensor never recorded has no business
// being presented as one. Called once per channel, since the channels don't
// share a time axis.
export function nearestSampleIndex(t: number[], seconds: number): number {
  if (t.length === 0) return -1;
  if (seconds <= t[0]) return 0;
  if (seconds >= t[t.length - 1]) return t.length - 1;

  let low = 0;
  let high = t.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (t[middle] <= seconds) {
      low = middle;
    } else {
      high = middle;
    }
  }

  // `low` and `high` now bracket `seconds`; pick whichever is closer, ties going
  // to the earlier sample.
  return seconds - t[low] <= t[high] - seconds ? low : high;
}

// Candidate x-axis steps, in seconds. Minute-shaped throughout: `axisTicks`
// would happily hand back a 250-second step, and nobody reads a dive profile in
// units of 4 minutes 10 seconds.
const ELAPSED_STEPS_SECONDS = [
  60, 120, 300, 600, 900, 1800, 3600, 7200,
];

// The elapsed-time gridlines for a dive of `durationSeconds`, in seconds,
// starting at 0 and never running past the end of the dive.
export function elapsedTicks(durationSeconds: number, targetTicks = 6): number[] {
  if (durationSeconds <= 0) return [0];

  const step =
    ELAPSED_STEPS_SECONDS.find(
      (candidate) => durationSeconds / candidate <= targetTicks,
    ) ?? ELAPSED_STEPS_SECONDS[ELAPSED_STEPS_SECONDS.length - 1];

  const ticks: number[] = [];
  for (let time = 0; time <= durationSeconds; time += step) {
    ticks.push(time);
  }
  return ticks;
}

// Where the crosshair's readout card sits vertically, given the topmost of the
// dots it describes. Returns a y in the chart's own coordinate space plus the
// CSS `translateY` that pins the card to it.
//
// Deliberately anchored to the *plot's* top or bottom edge rather than to the
// hovered point, which is what an earlier version did and got wrong. Two
// reasons, and the second is the bug:
//
//   - With a full-height crosshair, "the hovered point" is three different
//     points (one per channel), so picking one to hang the card off was already
//     arbitrary - and it made the card jump between channels while scrubbing.
//   - Offsetting from a point can only be done safely if you know how tall the
//     card is, and here you don't: its height depends on how many channels the
//     dive recorded, and the SVG scales to its container while the card's text
//     does not. A fixed "flip above the point when it's in the top third" rule
//     put the card 11 px past the top edge of a scroll container that clips
//     (`overflow-x: auto` computes `overflow-y` to `auto` too), so it was cut
//     off. Anchoring to an edge is correct for *any* card height and any scale.
//
// The card moves to the bottom when the topmost dot is high in the plot, so it
// doesn't cover the readings it is describing.
export const TOOLTIP_FLIP_FRACTION = 0.45;

export function tooltipVerticalAnchor(
  topmostY: number,
  plotTop: number,
  plotBottom: number,
): { y: number; translateY: string } {
  const height = plotBottom - plotTop;
  const fraction = height > 0 ? (topmostY - plotTop) / height : 0;

  return fraction < TOOLTIP_FLIP_FRACTION
    ? // Card's bottom edge on the plot's bottom edge, nudged clear of the axis.
      { y: plotBottom, translateY: "calc(-100% - 4px)" }
    : // Card's top edge on the plot's top edge.
      { y: plotTop, translateY: "4px" };
}

export interface Point {
  x: number;
  y: number;
}

// The `d` of the filled area under a curve: along the points, down to the
// baseline, back along it, closed.
//
// Kept here rather than inlined in the component so the path string is
// assertable - it is the one piece of SVG in this chart with a shape worth
// getting wrong.
export function buildAreaPath(points: Point[], baselineY: number): string {
  if (points.length === 0) return "";

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");

  return `${line} L${points[points.length - 1].x},${baselineY} L${points[0].x},${baselineY} Z`;
}

// A reading formatted for a tooltip or an axis label, at the channel's own
// resolution.
export function formatChannelValue(
  value: number,
  channel: ProfileChannel,
): string {
  return `${value.toFixed(channel.decimals)} ${channel.unit}`;
}
