import type {
  DiveProfile,
  DiveProfileEvent,
  DiveProfilePressureSeries,
  DiveProfileSeries,
} from "@/lib/api/dives";
import { niceDomain, type Domain } from "@/lib/chart-scale";
import {
  toDisplayUnits,
  unitLabel,
  unitSeparator,
  unitWord,
  type Dimension,
  type UnitSystem,
} from "@/lib/units";

// All of the dive profile chart's arithmetic, kept out of the component per the
// repo convention: pure functions in `lib/` get Vitest coverage, components
// aren't rendered in tests. If a number on that chart could be wrong, its
// derivation belongs here.

export type ProfileChannelKey =
  "depth" | "ceiling" | "temperature" | "pressure";

export interface ProfileChannel {
  key: ProfileChannelKey;
  label: string;
  unit: string;
  // What the API's integer `values` are divided by to reach display units.
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
  // Drawn as a dashed line rather than a solid one - in the plot *and* in the
  // legend swatch, which is the reason this is a property of the channel rather
  // than a check at the one place that draws a polyline. A solid swatch next to
  // a dashed curve is the one thing a legend must not say, and the two live far
  // enough apart in the component to drift if each decided for itself.
  dashed: boolean;
  // What a gap in this channel's samples means, and so how hard the chart works
  // to avoid drawing across one.
  //
  // For a measured channel a gap means "not recorded", and with fewer than three
  // samples there is no cadence to judge one by - so joining them is the only
  // honest thing left, and `gapThreshold`'s `Infinity` says exactly that. For
  // the deco ceiling a gap means **no obligation existed**, which is a fact
  // about the dive rather than about the sensor, and joining across it draws a
  // forbidden zone over water the diver was free to be in.
  //
  // Only the second kind is worth refusing to draw for, and refusing has a real
  // cost: a two-sample channel splits into two runs of one, which draw nothing,
  // and a channel with nothing drawable is not plotted at all. Paid for the
  // ceiling; not paid for depth, where it would replace a two-point line with
  // "this recording's file recorded no samples to plot" over a dive that
  // recorded two.
  //
  // Coincides with `dashed` today and says something different: that one is how
  // the curve is drawn, this is what its absence means.
  gapsAreMeaningful: boolean;
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
    dashed: false,
    gapsAreMeaningful: false,
  },
  ceiling: {
    key: "ceiling",
    label: "Deco ceiling",
    unit: "m",
    // Depth's scale, not one of its own - see `CEILING_SCALE` in the API's
    // `schemas/dive_profile.py`. A ceiling is a depth, and it is drawn against
    // the depth axis, so the two have to divide by the same number or the
    // shaded region would not line up with the curve it bounds.
    scale: 100, // centimeters
    decimals: 1,
    colorClass: "text-ceiling",
    inverted: true,
    // The only dashed curve on the chart, and the dash is load-bearing: this is
    // the one line here that was never measured. Depth, temperature and
    // pressure are readings; a ceiling is a computed limit that moved as the
    // diver's tissues loaded, and a solid line would present the two as the
    // same kind of fact.
    dashed: true,
    // A break in this series is a stretch of dive with no decompression
    // obligation, not a sensor dropping out.
    gapsAreMeaningful: true,
  },
  temperature: {
    key: "temperature",
    label: "Temperature",
    unit: "°C",
    scale: 10, // tenths of a degree
    decimals: 1,
    colorClass: "text-coral",
    inverted: false,
    dashed: false,
    gapsAreMeaningful: false,
  },
  pressure: {
    key: "pressure",
    label: "Tank pressure",
    unit: "bar",
    scale: 10, // tenths of a bar
    decimals: 0,
    colorClass: "text-pressure",
    inverted: false,
    dashed: false,
    gapsAreMeaningful: false,
  },
};

// The channels in the order they're plotted and listed in the legend. A separate
// list rather than `Object.keys` on the record above, which gives this order only
// by accident of how the object happens to be written.
export const PROFILE_CHANNEL_KEYS: readonly ProfileChannelKey[] = [
  "depth",
  "ceiling",
  "temperature",
  "pressure",
];

// Everything the legend switches, which is the four channels plus the event
// markers - and the markers are emphatically *not* a fifth channel. They have no
// scale, no unit and nothing to invert, so a `PROFILE_CHANNELS` entry would have
// had to invent all three; what they share with a channel is only that the
// legend names them and the diver can turn them off.
//
// A second list rather than a widened `ProfileChannelKey`, so that stays the type
// of "a thing with a domain" - which is what every axis, readout and segmenter in
// this module is written against, and none of them can say anything about a
// marker.
export type ProfileViewKey = ProfileChannelKey | "events";

export const PROFILE_VIEW_KEYS: readonly ProfileViewKey[] = [
  ...PROFILE_CHANNEL_KEYS,
  "events",
];

// What the legend calls the markers. No unit follows it, unlike every channel
// beside it - "Markers" is already the word the profile card's description and
// the chart's accessible summary use for them.
export const EVENTS_LABEL = "Markers";

export interface ChannelSeries {
  channel: ProfileChannel;
  // Elapsed seconds, as served. Kept as `t` rather than following the wire's
  // `times`: this is the chart's own shape, and every consumer of it below reads
  // a *converted* series, which is the difference worth keeping visible.
  t: number[];
  // Display units - the wire's integer `values` divided by the channel's scale.
  values: number[];
}

// Which of `lib/units.ts`'s dimensions each channel is a reading of.
//
// The ceiling is a **depth**, and sharing depth's dimension is what keeps the two
// converting identically - the same binding `scale` already has for the same
// reason. A shaded deco region drawn against a curve converted by any other factor
// would drift off the water it bounds.
const CHANNEL_DIMENSION: Record<ProfileChannelKey, Dimension> = {
  depth: "depth",
  ceiling: "depth",
  temperature: "temperature",
  pressure: "pressure",
};

/**
 * A channel as it is labelled and quoted for one system.
 *
 * The metric channel unchanged, or one carrying the imperial unit and no decimals
 * at all: a foot, a degree Fahrenheit and a psi are each finer than the tenth of a
 * metric unit the stored scale resolves to, so a decimal there would be inventing
 * precision rather than preserving it.
 */
export function displayChannel(
  channel: ProfileChannel,
  units: UnitSystem,
): ProfileChannel {
  if (units === "metric") return channel;

  return {
    ...channel,
    unit: unitLabel(CHANNEL_DIMENSION[channel.key], units),
    decimals: 0,
  };
}

/**
 * One reading, converted - **after** the wire scale has been divided out.
 *
 * That order is the whole rule: `scale` is a pair with `schemas/dive_profile.py`
 * and describes how the API encodes an integer, not how a diver reads one. Folding
 * a unit conversion into it would make this app's idea of a centimetre disagree
 * with the API's.
 */
export function toChannelDisplay(
  scaledValue: number,
  key: ProfileChannelKey,
  units: UnitSystem,
): number {
  return toDisplayUnits(scaledValue, CHANNEL_DIMENSION[key], units);
}

/** The spoken unit for a channel, for the chart's accessible description. */
export function channelWord(key: ProfileChannelKey, units: UnitSystem): string {
  return unitWord(CHANNEL_DIMENSION[key], units);
}

// A channel's stored integers as display units, or `null` when the profile
// doesn't carry that channel.
//
// Divides, never multiplies by a reciprocal: `1234 / 100` is the correctly
// rounded `12.34`, whereas `1234 * 0.01` is `12.340000000000002` - exactly the
// noise the integer encoding was chosen to remove.
export function toChannelSeries(
  profile: DiveProfile,
  key: "depth" | "ceiling" | "temperature",
  units: UnitSystem,
): ChannelSeries | null {
  const series: DiveProfileSeries | null | undefined = profile[key];
  if (!series || series.times.length === 0) return null;

  const channel = PROFILE_CHANNELS[key];
  // Converted here, once, rather than at each of the dozen places downstream that
  // read `values`. Everything past this point - the domains, the axis ticks, the
  // crosshair, the accessible extremes - is then already in the units it renders
  // in, so `niceDomain` picks round numbers in the system the diver is reading
  // and there is nowhere left for a conversion to be forgotten.
  return {
    channel: displayChannel(channel, units),
    t: series.times,
    values: series.values.map((value) =>
      toChannelDisplay(value / channel.scale, key, units),
    ),
  };
}

// Same, per cylinder. Each cylinder is its own line on the chart, labelled by
// its `gas_number`.
export function toPressureSeries(
  profile: DiveProfile,
  units: UnitSystem,
): (ChannelSeries & { gasNumber: number })[] {
  const channel = PROFILE_CHANNELS.pressure;
  return (profile.pressures ?? [])
    .filter((cylinder) => cylinder.times.length > 0)
    .map((cylinder: DiveProfilePressureSeries) => ({
      channel: displayChannel(channel, units),
      gasNumber: cylinder.gas_number,
      t: cylinder.times,
      values: cylinder.values.map((value) =>
        toChannelDisplay(value / channel.scale, "pressure", units),
      ),
    }));
}

// The one vertical axis depth and the deco ceiling are both scaled against.
//
// One domain across both, exactly as every cylinder shares one pressure domain
// and for a sharper version of the same reason: a ceiling is a bound *on* the
// depth curve, so on an axis of its own a 3 m ceiling could be drawn below a
// 40 m depth. Anchored at the surface by feeding `niceDomain` the `0` that makes
// `Math.floor(0 / step) * step` land on it, the same way depth alone used to.
//
// Both channels' values go in whether or not they're currently plotted, so the
// axis doesn't shift under the curves when the ceiling is toggled. On real data
// that costs nothing - a ceiling is always shallower than the depth it was
// computed at - but a domain that depends on what's visible is a needless way
// for the picture to move.
export function depthDomain(
  depthValues: readonly number[],
  ceilingValues: readonly number[],
): Domain {
  return niceDomain([0, ...depthValues, ...ceilingValues]);
}

// The event nearest `seconds`, or null when the closest is further away than
// `maxDeltaSeconds`.
//
// A tolerance rather than a nearest-always, because unlike a channel readout an
// event marker is a discrete thing at a discrete instant: naming the dive's only
// gas switch while the cursor sits twenty minutes away from it would be a
// caption for something that isn't under the crosshair. The caller sets the
// tolerance from the chart's own geometry, so it stays a fixed distance in
// pixels rather than a fixed number of seconds - a tolerance that reads well on
// a 20-minute dive is invisible on a three-hour one.
//
// A linear scan over a list the API caps at 200, and deliberately not a binary
// search: the saving is unmeasurable and the scan doesn't care whether the list
// arrived sorted.
//
// **Ties go to the earlier event**, and that is compared on `time` rather than left
// to iteration order. `delta < bestDelta` alone would mean "first in the array",
// which is only the same thing on a sorted list - and not assuming sorted input
// is the whole reason this is a scan. The API does sort in `normalize`, so this
// decides nothing today; a comment claiming one rule while the code follows
// another is the part that would eventually cost someone an afternoon.
export function nearestEvent(
  events: readonly DiveProfileEvent[],
  seconds: number,
  maxDeltaSeconds: number,
): DiveProfileEvent | null {
  let best: DiveProfileEvent | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const event of events) {
    const delta = Math.abs(event.time - seconds);
    if (delta > maxDeltaSeconds) continue;

    if (
      best === null ||
      delta < bestDelta ||
      (delta === bestDelta && event.time < best.time)
    ) {
      best = event;
      bestDelta = delta;
    }
  }

  return best;
}

// What a marker says, in words - for the crosshair readout and for the chart's
// accessible summary.
//
// An `other` is the device's own wording and is passed through as it stands:
// that is the entire point of the type, and rephrasing "Mandatory Safety Stop
// Broken" into something tidier would be inventing a claim about a dive. The
// API guarantees a label on an `other` (its `_validate_events` rejects one
// without), so the fallback here is only for a payload that broke that promise -
// an unlabelled tick with no words is still better than the string "undefined".
//
// The `default` is not dead code, however much the exhaustive `case` list makes
// it look like one. `ProfileEventType` is closed *today*, and the two repos
// deploy independently: an API that grows a sixth type reaches a browser still
// running this bundle, where `event.type` is a string TypeScript merely believes
// is one of five. Without the branch the switch falls off the end and returns
// `undefined` from a function typed `: string`, which renders as an empty
// tooltip line and puts the literal word "undefined" in the chart's
// `aria-label`. Degrading to the device's own wording, or to a neutral noun,
// costs three lines.
export function describeEvent(event: DiveProfileEvent): string {
  switch (event.type) {
    case "gas_switch":
      // The cylinder's own number, the same label the mixtures table and the
      // pressure curves carry - and `0` is a real gas number on a Suunto Ocean,
      // so this tests for null rather than for falsiness.
      return event.gas_number == null
        ? "Gas switch"
        : `Gas switch to gas ${event.gas_number}`;
    case "deep_stop":
      return "Deep stop";
    case "safety_stop":
      return "Safety stop";
    case "bookmark":
      return "Bookmark";
    // `other` and an unknown type take the same branch, and deliberately share
    // one `return` rather than repeating it: they want identical handling for
    // almost the same reason - the device said something this vocabulary has no
    // word for - and two identical branches are two things to keep in step.
    case "other":
    default:
      return event.label?.trim() || "Device event";
  }
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

// The same threshold, made safe to compare a *distance* against - which is what
// the crosshair does and the segmenter doesn't.
//
// `gapThreshold` answers `Infinity` for a series of one or two samples, and for
// segmenting that is exactly right: there is no cadence to derive, and no gap
// that could be judged a dropout, so the honest answer is "never break this".
// Fed to `sampleIndexAt` the same value means "no distance is too far", which
// silently turns the guard back into the clamping `nearestSampleIndex` it exists
// to replace.
//
// **That is not a hypothetical shape for the deco ceiling.** The API drops zero
// ceilings, so the channel carries samples only while an obligation existed - a
// dive that tips into deco for one or two 10-second samples produces a two-point
// series and nothing else. With an infinite tolerance the crosshair then reports
// that ceiling at *every instant of the dive*, which is precisely the invented
// obligation this guard was written to prevent, arriving on the shortest and
// least expected obligations rather than the long obvious ones. The one-sample
// case is worse still: `segmentByTimeGap` yields a single-point run that draws
// nothing, so the chart shows no ceiling at all while the tooltip insists on one.
//
// The floor rather than the median, because a series this short has no median
// worth having. It errs toward refusing: on two samples 70 s apart the line is
// drawn across the whole span while the readout only answers within 15 s of
// either end. Silence where a curve exists is a cosmetic loss; a number where no
// obligation existed is not.
//
// **Named for the readout, but on a channel whose gaps are meaningful it is the
// segmentation threshold too** - see `gapsAreMeaningful` and the `runs()` helper
// in `dive-profile-chart.tsx`. That is the point rather than an overload: on the
// ceiling the line and the crosshair have to be cut at one number, and this is
// the one that is finite. Anyone looking for "the threshold the line was cut at"
// on the ceiling should stop here rather than re-deriving it.
export function readoutTolerance(t: number[]): number {
  const threshold = gapThreshold(t);

  return Number.isFinite(threshold) ? threshold : MIN_GAP_SECONDS;
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

// The sample that can honestly be called this channel's reading at `seconds`,
// or -1 when there isn't one.
//
// `nearestSampleIndex` clamps at both ends, which is right for finding a
// neighbour and wrong for captioning one: it answers "the closest sample" even
// when the closest sample is twenty minutes away. The chart already refuses to
// *draw* a line across a stretch a channel didn't record (`segmentByTimeGap`),
// and the crosshair has to refuse to quote a number there for the same reason -
// no line, no dot, no readout.
//
// The deco ceiling is what makes this unmistakable rather than merely untidy. A
// gap in that channel means the dive owed no decompression, so a clamped reading
// before the first sample reports a 3.0 m ceiling five minutes into a dive that
// was still well inside no-deco limits - inventing an obligation, on the one
// curve where that is a safety claim rather than a cosmetic slip. The same
// clamp was already quoting tank pressure through a transmitter dropout; that
// was a lie too, just a quieter one.
//
// `maxDeltaSeconds` is the channel's own `readoutTolerance` - deliberately not
// `gapThreshold`, which is the number this looks like it should take and is the
// wrong one: its `Infinity` below three samples reads here as "no distance is
// too far to quote". The caller passes the same value it cut the line at, so the
// two cannot disagree about the same stretch of dive.
//
// Being close enough is necessary and not sufficient. A sample can clear this
// and still have been dropped from the picture for sitting in a run too short to
// draw - which is what `drawnSampleIndexAt` below exists to handle, and what
// every caller in the chart actually wants.
export function sampleIndexAt(
  t: number[],
  seconds: number,
  maxDeltaSeconds: number,
): number {
  const index = nearestSampleIndex(t, seconds);
  if (index < 0) return -1;

  return Math.abs(t[index] - seconds) <= maxDeltaSeconds ? index : -1;
}

// The nearest sample that is close enough to quote **and** made it onto the
// chart, or -1.
//
// Not `sampleIndexAt` followed by a membership test, which is what this replaced
// and which fails in one specific way: the nearest sample overall may be one the
// chart dropped, and rejecting it outright then reports nothing even though a
// drawn sample sits just behind it, well inside the tolerance. On
// `t = [1000, 1010, 1020, 1060]` with a 30 s tolerance and 1060 dropped as an
// isolated run, hovering at 1045 s resolved to 1060, failed the membership test,
// and went silent - with 1020 only 25 s away and visibly drawn.
//
// So the search walks outward from the nearest sample and takes the first drawn
// one, stopping as soon as both frontiers are past the tolerance. That makes the
// rule sayable in one line - *the nearest drawn sample within tolerance* - rather
// than as two rules whose interaction has to be reasoned about.
export function drawnSampleIndexAt(
  t: number[],
  seconds: number,
  maxDeltaSeconds: number,
  drawn: ReadonlySet<number>,
): number {
  const nearest = nearestSampleIndex(t, seconds);
  if (nearest < 0) return -1;

  let low = nearest;
  let high = nearest + 1;

  while (low >= 0 || high < t.length) {
    const lowDelta =
      low >= 0 ? Math.abs(t[low] - seconds) : Number.POSITIVE_INFINITY;
    const highDelta =
      high < t.length ? Math.abs(t[high] - seconds) : Number.POSITIVE_INFINITY;

    // Both frontiers are out of reach, and they only get further away.
    if (Math.min(lowDelta, highDelta) > maxDeltaSeconds) return -1;

    // Ties to the earlier sample, matching `nearestSampleIndex`.
    if (lowDelta <= highDelta) {
      if (drawn.has(low)) return low;
      low--;
    } else {
      if (drawn.has(high)) return high;
      high++;
    }
  }

  return -1;
}

// Candidate x-axis steps, in seconds. Minute-shaped throughout: `axisTicks`
// would happily hand back a 250-second step, and nobody reads a dive profile in
// units of 4 minutes 10 seconds.
const ELAPSED_STEPS_SECONDS = [60, 120, 300, 600, 900, 1800, 3600, 7200];

// The elapsed-time gridlines for a dive of `durationSeconds`, in seconds,
// starting at 0 and never running past the end of the dive.
export function elapsedTicks(
  durationSeconds: number,
  targetTicks = 6,
): number[] {
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

// `Point` and `buildAreaPath` used to live here. They moved, unchanged, to
// `lib/chart-path.ts` once the gas chart needed them too - same reasoning as the
// `chart-scale.ts` move noted at the top of `lib/dive-gas.ts`. Their tests moved
// with them, to `chart-path.test.ts`.

// A reading formatted for a tooltip or an axis label, at the channel's own
// resolution.
export function formatChannelValue(
  value: number,
  channel: ProfileChannel,
): string {
  // `value` is already in the channel's own units - the series were converted when
  // they were built, so there is nothing to convert here and converting again would
  // double it. The separator comes from the same table the label does, which is
  // what makes a temperature read "21.6°C" here exactly as it does in the sidebar;
  // it used to be a hardcoded space, and was the one place in the app that spaced
  // a degree symbol.
  return `${value.toFixed(channel.decimals)}${unitSeparator(CHANNEL_DIMENSION[channel.key])}${channel.unit}`;
}
