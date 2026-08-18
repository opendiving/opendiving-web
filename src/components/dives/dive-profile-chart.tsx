"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DiveProfile, DiveProfileEvent } from "@/lib/api/dives";
import { axisTicks, niceDomain, type Domain } from "@/lib/chart-scale";
import { buildAreaPath } from "@/lib/chart-path";
import {
  type ChannelSeries,
  type ProfileChannel,
  type ProfileChannelKey,
  type ProfileViewKey,
  EVENTS_LABEL,
  PROFILE_CHANNELS,
  PROFILE_CHANNEL_KEYS,
  PROFILE_VIEW_KEYS,
  channelWord,
  depthDomain,
  displayChannel,
  describeEvent,
  elapsedTicks,
  formatChannelValue,
  drawnSampleIndexAt,
  gapThreshold,
  nearestEvent,
  readoutTolerance,
  segmentByTimeGap,
  toChannelSeries,
  toPressureSeries,
  tooltipVerticalAnchor,
} from "@/lib/dive-profile";
import {
  DIVE_PROFILE_SERIES_KEY,
  parseSeriesVisibility,
  readStoredSeries,
  subscribeToNothing,
  toggleSeries,
  writeSeriesVisibility,
} from "@/lib/chart-series-view";
import {
  formatDurationForForm,
  formatDurationHoursMinutes,
} from "@/lib/date-time";
import { cn } from "@/lib/utils";
import { useUnits } from "@/hooks/useUnits";
import type { UnitSystem } from "@/lib/units";

// Hand-rolled SVG rather than a charting library. The app ships a strict
// nonce-based CSP (`src/proxy.ts`): inline style *attributes* are allowed, but a
// library that injects a `<style>` element - which the emotion/styled-components
// based ones do - would work in dev and break in production, which is a
// miserable bug to acquire for one chart. Stated here in full rather than
// cross-referenced, because this comment is what stops the next person reaching
// for Recharts.
//
// Four channels, four colors, all of them theme-stable tokens declared once in
// `globals.css` and never redeclared under `.dark` (see the note on `--pressure`
// there). `--primary` would not do: it is near-black in light mode and a mid
// grey in dark, which left the gas chart's trend line barely visible.

// The viewBox coordinate space. Not pixels: the SVG scales to its container, so
// these are only ever ratios to each other.
const WIDTH = 720;
const HEIGHT = 280;
// Wider on both sides than the gas chart: depth is on the left and temperature
// and pressure share the right, so both margins carry axis labels.
const PADDING = { top: 14, right: 46, bottom: 28, left: 44 };

const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;
const PLOT_BOTTOM = HEIGHT - PADDING.bottom;

// How close the crosshair has to be to an event marker before the readout names
// it, in viewBox units - converted to seconds per dive, so it stays the same
// distance on screen whether the dive lasted 20 minutes or three hours.
// Comfortably wider than the glyph itself (4 units), because the diver is
// aiming at a marker with a crosshair that has no snap.
const EVENT_HOVER_UNITS = 8;

// The marker's own geometry: a tick standing on the x-axis with a glyph on top
// of it. Anchored to the axis rather than to the depth curve, which is where a
// dive computer's own display puts them and the only place that still works with
// depth toggled off.
const EVENT_TICK_HEIGHT = 9;
const EVENT_GLYPH_RADIUS = 4;
// Between the top of the tick and the centre of the glyph, so the two read as
// one mark rather than as a shape resting on a line.
const EVENT_GLYPH_GAP = 2;

// How many markers the chart's accessible summary names before it starts
// counting - see `describeProfile`.
const MAX_DESCRIBED_EVENTS = 8;

export interface DiveProfileChartProps {
  profile: DiveProfile;
}

interface PlottedChannel {
  key: string;
  // Which of the four toggles this line belongs to. Not the same as `key`: two
  // cylinders are two lines and one channel.
  channelKey: ProfileChannelKey;
  label: string;
  series: ChannelSeries;
  // The axis this line is scaled against, kept alongside it so the axis labels
  // and gridlines can read the same domain the curve was drawn with rather than
  // recomputing one and hoping it matches. It wouldn't, for pressure: every
  // cylinder shares one domain across all of them.
  domain: Domain;
  // Display value -> y coordinate.
  y: (value: number) => number;
  // Runs of consecutive samples, as index arrays - never one polyline across a
  // sensor dropout, and never a run too short to draw.
  segments: number[][];
  // The threshold those runs were cut at, kept so the crosshair can refuse to
  // quote a reading from a stretch the line refuses to cross - see
  // `sampleIndexAt`.
  gapSeconds: number;
  // Which sample indices actually reached the picture.
  //
  // The tolerance alone is not enough to keep the readout honest, which is the
  // second time this invariant has had to be tightened. `gapSeconds` says "is
  // there a sample near enough to quote", and a sample dropped for being an
  // undrawable run of one is near enough to itself - so the crosshair went on
  // naming a 3.0 m ceiling, with a red dot on it, over a chart that had drawn no
  // ceiling at all. Membership here is the question that cannot be answered
  // "yes" by a sample nothing was drawn from.
  drawn: Set<number>;
}

// Module-level so the reference is stable across renders - see
// `subscribeToNothing`. `useSyncExternalStore` re-reads whenever this identity
// changes, which an inline arrow would make every render.
const readStoredChannels = () => readStoredSeries(DIVE_PROFILE_SERIES_KEY);

// A channel's readings that reached the picture, in display units.
//
// Everything that reports a channel's *extremes* - the shared vertical axis and
// the accessible summary - has to read these rather than `series.values`. A
// sample dropped for sitting in an undrawable run is still in the raw array, and
// both of those consumers take a max over it: on a ceiling of
// `t = [600, 610, 620, 2000]` where only the first run draws, the summary
// announced "deco ceiling to 9.0 meters" over a chart whose deepest drawn
// ceiling was 3.0 m, and the axis stretched to fit a curve that isn't there.
//
// The same disagreement `drawn` and the channel filter already close for the
// crosshair and the legend, at a granularity neither of them reached: those
// two ask "is this channel on the chart", and this asks "is this *sample*".
function drawnValues(
  series: ChannelSeries | null,
  drawn: ReadonlySet<number> | undefined,
): number[] {
  if (!series || !drawn) return [];

  return [...drawn].map((index) => series.values[index]);
}

export function DiveProfileChart({ profile }: DiveProfileChartProps) {
  const units = useUnits();
  // One hovered *time*, not one hovered sample, and one piece of state for the
  // whole chart - the same call `GasUseChart` makes, for the same reason. It
  // can't be an index here: the channels are independently sampled and don't
  // share a time axis, so "the sample under the cursor" is a different index per
  // channel. The cursor's x maps to seconds once, and each channel resolves its
  // own nearest sample from that (`sampleIndexAt`), or none at all where it
  // recorded nothing near enough to be quoted.
  const [hoveredSeconds, setHoveredSeconds] = useState<number | null>(null);

  // What the diver picked in *this* visit, and null until they pick - which is
  // what leaves room for the remembered selection underneath. Channels and the
  // event markers together, because they are one legend and one stored entry.
  const [chosen, setChosen] = useState<ProfileViewKey[] | null>(null);

  // The selection remembered from last time.
  //
  // Through `useSyncExternalStore` rather than a `useState` + effect pair, which
  // is what this wants to be and can't: `localStorage` doesn't exist on the
  // server, so a first client render that read it would disagree with the HTML
  // Next rendered and be a hydration mismatch. The three arguments are exactly
  // that problem's shape - a server snapshot of `null` to hydrate against, a
  // client snapshot read straight from storage, and no subscription. The same
  // call `GasUseCard` makes for its remembered period, for the same reasons.
  const storedChannels = useSyncExternalStore(
    subscribeToNothing,
    readStoredChannels,
    () => null,
  );
  const remembered = useMemo(
    () => parseSeriesVisibility(storedChannels, PROFILE_VIEW_KEYS),
    [storedChannels],
  );

  // Remembered for next time, in an effect rather than in the click handler
  // below, which is what keeps that handler's updater pure - React is entitled
  // to call an updater twice.
  useEffect(() => {
    if (chosen) writeSeriesVisibility(DIVE_PROFILE_SERIES_KEY, chosen);
  }, [chosen]);

  // Converted here and nowhere after: every domain, tick, readout and spoken
  // extreme below reads `values`, which is already in the diver's own units.
  const depth = toChannelSeries(profile, "depth", units);
  const ceiling = toChannelSeries(profile, "ceiling", units);
  const temperature = toChannelSeries(profile, "temperature", units);
  const pressure = toPressureSeries(profile, units);

  const duration = profile.duration_seconds;
  const x = (seconds: number) =>
    PADDING.left + (duration > 0 ? seconds / duration : 0) * PLOT_WIDTH;

  // Markers that land inside the plot, which is this chart's job rather than the
  // API's and is stated as such at the other end: `_rebase_events` clamps the low
  // side at zero, deliberately leaves the high side alone - `duration_seconds` is
  // the span of the *samples*, and a device goes on recording after the last one,
  // so a FIT `user_marker` pressed after surfacing happened when the file says it
  // did - and signs off with "a chart that draws past its x domain is the chart's
  // to clip". This is that clip.
  //
  // Dropped rather than clamped to the last second, which would invent a time to
  // keep a marker on screen, and rather than left to the SVG's own clipping,
  // which is not clipping at all: `x(t)` past `duration` lands in the right-hand
  // axis-label gutter first (aligned with no time on the axis) and only leaves
  // the viewBox further out.
  //
  // One filtered list feeds all three consumers - the glyphs, the crosshair and
  // `describeProfile` - so the picture and the accessible summary cannot disagree
  // about what the chart contains. That disagreement is the actual bug here: a
  // marker invisible to the eye but named to a screen reader.
  const events = (profile.events ?? []).filter(
    (event) => event.t >= 0 && event.t <= duration,
  );

  // Rebuilt every render rather than memoized: the series are already capped at
  // 1 200 points per channel server-side, so this is a few thousand arithmetic
  // operations - and every input to it is a fresh object derived from `profile`,
  // which would make a `useMemo` dependency list either a lie or a no-op.
  const channels: PlottedChannel[] = (() => {
    const plotted: PlottedChannel[] = [];

    // The two things every channel derives from its own cadence, from *one*
    // threshold - which is the whole point of `PlottedChannel` carrying
    // `gapSeconds`, and which an earlier version of this quietly gave up by
    // passing `gapThreshold` to the segmenter and `readoutTolerance` to the
    // readout.
    //
    // The readout is always cut at `readoutTolerance`, whose floor is what stops
    // the crosshair quoting a reading from the far side of the dive. The *line*
    // is cut at that same number only where a gap means something - see
    // `gapsAreMeaningful` on `ProfileChannel`.
    //
    // On the ceiling, `gapThreshold`'s `Infinity` below three samples reads as
    // "join these however far apart they are", which draws a twenty-minute
    // shaded forbidden zone between two isolated moments in deco. Two samples ten
    // seconds apart still join, which is the case worth drawing; two twenty
    // minutes apart become single-point runs, dropped here because a one-sample
    // `<polyline>` has no line and `buildAreaPath` turns one point into a
    // degenerate zero-width shape - markup that renders nothing. Dropping them
    // makes "no ceiling is drawn here" true of the DOM as well as the pixels.
    //
    // On a measured channel that same strictness buys nothing and costs a lot: a
    // gap there means "not recorded", two samples are still two readings, and
    // filtering them out would leave a depth-only dive rendering "this dive's
    // imported file recorded no samples to plot" over a profile that has two.
    const runs = (t: number[], channel: ProfileChannel) => {
      const tolerance = readoutTolerance(t);
      const cut = channel.gapsAreMeaningful ? tolerance : gapThreshold(t);
      const segments = segmentByTimeGap(t, cut).filter(
        (segment) => !channel.gapsAreMeaningful || segment.length > 1,
      );

      return {
        gapSeconds: tolerance,
        segments,
        drawn: new Set(segments.flat()),
      };
    };

    const depthRuns = depth ? runs(depth.t, PROFILE_CHANNELS.depth) : null;
    const ceilingRuns = ceiling
      ? runs(ceiling.t, PROFILE_CHANNELS.ceiling)
      : null;

    // Anchored at the surface and inverted: `0` at the top, deeper further
    // down. One domain for depth and the ceiling both - see `depthDomain`, which
    // is what keeps a 3 m ceiling drawn above a 40 m depth instead of on an axis
    // of its own where it could land below it.
    //
    // From the values that were *drawn*, not from the raw series: a sample
    // dropped for sitting in an undrawable run would otherwise stretch this axis
    // to accommodate a reading no curve ever reaches.
    const vertical = depthDomain(
      drawnValues(depth, depthRuns?.drawn),
      drawnValues(ceiling, ceilingRuns?.drawn),
    );
    const verticalY = (value: number) =>
      PADDING.top +
      ((value - vertical.min) / (vertical.max - vertical.min)) * PLOT_HEIGHT;

    if (depth && depthRuns) {
      plotted.push({
        key: "depth",
        channelKey: "depth",
        label: PROFILE_CHANNELS.depth.label,
        series: depth,
        domain: vertical,
        y: verticalY,
        ...depthRuns,
      });
    }

    if (ceiling && ceilingRuns) {
      plotted.push({
        key: "ceiling",
        channelKey: "ceiling",
        label: PROFILE_CHANNELS.ceiling.label,
        series: ceiling,
        domain: vertical,
        y: verticalY,
        // Segmented like every other channel, and here the gaps carry the most
        // meaning of any on the chart: a break in this series is a stretch of
        // the dive with *no* decompression obligation, not a sensor dropping
        // out. Drawing through one - or quoting a ceiling into one, which is
        // what `gapSeconds` stops the crosshair doing - would claim the diver
        // was held to a ceiling they were free of.
        ...ceilingRuns,
      });
    }

    if (temperature) {
      // Its own domain, not shared with depth: a 21.6-21.9 °C range - which is
      // what a whole dive's temperature usually spans - would be a flat line on
      // any axis wide enough for depth.
      const domain = niceDomain(temperature.values);
      plotted.push({
        key: "temperature",
        channelKey: "temperature",
        label: PROFILE_CHANNELS.temperature.label,
        series: temperature,
        domain,
        y: (value) =>
          PADDING.top +
          (1 - (value - domain.min) / (domain.max - domain.min)) * PLOT_HEIGHT,
        ...runs(temperature.t, PROFILE_CHANNELS.temperature),
      });
    }

    if (pressure.length > 0) {
      // One domain across every cylinder, unlike the channels above: two tanks
      // on one dive are directly comparable, and giving each its own axis would
      // make a 50-bar stage look like the 200-bar back gas.
      const domain = niceDomain(
        pressure.flatMap((cylinder) => cylinder.values),
      );
      for (const cylinder of pressure) {
        plotted.push({
          key: `pressure-${cylinder.gasNumber}`,
          channelKey: "pressure",
          label:
            pressure.length > 1
              ? `${PROFILE_CHANNELS.pressure.label} (gas ${cylinder.gasNumber})`
              : PROFILE_CHANNELS.pressure.label,
          series: cylinder,
          domain,
          y: (value) =>
            PADDING.top +
            (1 - (value - domain.min) / (domain.max - domain.min)) *
              PLOT_HEIGHT,
          ...runs(cylinder.t, PROFILE_CHANNELS.pressure),
        });
      }
    }

    // A channel with nothing drawable left is not a plotted channel, and
    // dropping it here is what makes that true everywhere at once - the legend,
    // both axes, the crosshair and the accessible summary all derive from this
    // list. Without it a series too sparse to draw still claimed a toggle
    // reading "on", a fully labelled axis in its own colour, and a line in the
    // `aria-label`, over a plot with no curve on it.
    //
    // "Too sparse to draw" is not a hypothetical: it is a two-sample channel,
    // where `readoutTolerance`'s floor splits the pair into two runs of one. On
    // the ceiling that is a brief obligation, the shape this whole guard exists
    // for; on the others it is a device that recorded twice, which is degenerate
    // but not impossible.
    return plotted.filter((channel) => channel.segments.length > 0);
  })();

  // Which channels this dive both recorded *and* can draw - the only ones worth
  // offering a toggle for. A remembered selection is intersected with it below
  // rather than used as stored: dives differ in what they carry, and
  // "temperature only" is a perfectly reasonable thing to have chosen on a dive
  // that had temperature.
  //
  // The markers ride along on the same test: they are offered when the dive has
  // any that land inside the plot, and a dive with none gets no switch for them,
  // exactly as a dive with no ceiling gets no ceiling switch. Kept as two lists
  // rather than one filter over `PROFILE_VIEW_KEYS`, because "which channels can
  // this dive draw" is a question the fallback below has to ask on its own.
  const availableChannels = PROFILE_CHANNEL_KEYS.filter((key) =>
    channels.some((channel) => channel.channelKey === key),
  );
  const available: ProfileViewKey[] =
    events.length > 0 ? [...availableChannels, "events"] : availableChannels;

  // On the *channels*, not on `available`, which now also counts the markers. A
  // profile carrying events and no drawable series would otherwise render a plot
  // box with a time axis, a row of ticks and a legend reading only "Markers",
  // with nothing to say why it is bare - and the sentence below is still true of
  // it, since markers are annotations rather than samples.
  if (channels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This dive&apos;s imported file recorded no samples to plot.
      </p>
    );
  }

  // The selection, over **every key the legend can switch** rather than over the
  // ones this dive happens to offer. Three sources, most specific first: what the
  // diver toggled in this visit, then what they were reading last visit, then
  // everything.
  //
  // Held at full width because `available` is per-dive while the stored entry is
  // one entry for the whole app, so anything that narrows the selection to this
  // dive's keys erases the diver's opinion about the keys it lacks. Hide the
  // temperature curve on a dive whose computer logged no markers, and a selection
  // narrowed to that dive would be written back without `events` - so the next
  // dive that *has* markers opens with them hidden and a legend entry claiming
  // the diver turned them off. That is precisely the failure `DIVE_PROFILE_SERIES_KEY`
  // bumps a version to fix once, at migration, reopened on every marker-less dive.
  //
  // The same leak was already live for the ceiling before the markers existed - a
  // no-deco dive offers no ceiling toggle - which is why this is written over the
  // key list rather than patched for `events`.
  const selectedKeys = chosen ?? remembered ?? PROFILE_VIEW_KEYS;

  // What that selection plots *here*.
  const selectedHere = selectedKeys.filter((key) => available.includes(key));

  // Whether that selection draws a **curve** here. The markers deliberately do not
  // count: a plot with nothing on it but marker ticks is the blank chart the
  // fallback below exists to avoid, not a selection that plots something. Asking
  // `selectedHere.length > 0` instead let a stored `["temperature", "events"]`
  // opened on a depth-and-markers dive survive as `["events"]` - no curve, no
  // vertical axis, no gridlines, and no message either, because the overlay stands
  // down while the markers are up.
  const plotsACurveHere = selectedHere.some((key) => key !== "events");

  // A *remembered* selection that draws no curve here is skipped - a dive that
  // recorded only what you'd hidden should open showing what it does have, not
  // blank. An empty `chosen` is honored, by contrast: that is a choice just made,
  // on this dive, and the `!== null` is what tells the two apart.
  //
  // The fallback restores the **curves only**, carrying the markers choice through
  // untouched. Falling back to `available` wholesale would switch the markers back
  // on, and under this key their absence from a selection is a real "off" rather
  // than a gap - which is the whole reason the selection is held at full width.
  // Nothing about the marker preference caused the blank plot, so nothing about it
  // needs overriding to fix one.
  const visible =
    chosen !== null || plotsACurveHere
      ? selectedHere
      : [
          ...availableChannels,
          ...selectedHere.filter((key) => key === "events"),
        ];

  // What's on screen, lifted back over the full key list by re-attaching the keys
  // this dive can't show. Toggling from this rather than from `visible` is the
  // whole of the fix above; taking it from `visible` rather than from
  // `selectedKeys` is what keeps a click honest in the fallback case, where the
  // remembered selection plots nothing here and the chart is showing everything -
  // there, flipping a key against the stored selection would *add* the curve the
  // diver just asked to hide.
  const selection = [
    ...visible,
    ...selectedKeys.filter((key) => !available.includes(key)),
  ];

  // The updater form, not `toggleSeries(selection, ...)`. `selection` is this
  // render's value, and two toggles clicked inside one batch would both compute
  // from it - so the second would silently undo the first.
  const toggle = (key: ProfileViewKey) =>
    setChosen((current) =>
      toggleSeries(current ?? selection, key, PROFILE_VIEW_KEYS),
    );

  const shown = channels.filter((channel) =>
    visible.includes(channel.channelKey),
  );

  // Whether the markers are on the plot right now. Read by everything that says
  // anything about them - the glyphs, the crosshair and the accessible summary -
  // so a marker the diver has switched off can't go on being named by the card
  // or read out to a screen reader. The same rule `shownValues` enforces for the
  // channels, and for the same reason: the chart has three ways of describing
  // itself and they have to agree.
  const eventsShown = visible.includes("events");

  // Whether a channel is on screen right now: recorded, drawable, and not
  // toggled off. What `describeProfile` is built from, so the sentence a screen
  // reader hears describes the same chart the eye is looking at - `available`
  // is the half that was missing, and a channel too sparse to draw was being
  // named to a screen reader over a plot with no curve on it.
  // The readings a channel has on screen right now: visible, and drawn. Built
  // from `channels`, so a channel that was filtered out contributes nothing and
  // a sample that was filtered out of a run contributes nothing either - which
  // is what keeps the sentence a screen reader hears describing the same chart
  // the eye is looking at, down to the extremes it quotes.
  const shownValues = (key: ProfileChannelKey): number[] =>
    visible.includes(key)
      ? channels
          .filter((channel) => channel.channelKey === key)
          .flatMap((channel) => drawnValues(channel.series, channel.drawn))
      : [];

  const depthChannel = shown.find((channel) => channel.key === "depth") ?? null;
  const ceilingChannel =
    shown.find((channel) => channel.key === "ceiling") ?? null;
  const temperatureChannel =
    shown.find((channel) => channel.key === "temperature") ?? null;
  const pressureChannel =
    shown.find((channel) => channel.channelKey === "pressure") ?? null;

  // Depth and the ceiling are one scale, not two - the same meters on the same
  // domain, labelled in whichever of the two colours is drawing it. So the plot
  // holds at most three scales however many curves are on it, and this is the
  // first of them.
  const verticalChannel = depthChannel ?? ceilingChannel;
  const scales = [verticalChannel, temperatureChannel, pressureChannel].filter(
    (channel): channel is PlottedChannel => channel !== null,
  );

  // **Sides are fixed while there are two scales to tell apart**: meters on the
  // left, temperature on the right, and pressure taking whichever of the two the
  // others left free. A diver reads this chart across a logbook of dives, and an
  // axis that changes sides with the channel mix makes them re-read the colour
  // of the numbers every time - the labels are coloured, but hue is a slower
  // thing to check than position.
  //
  // Pressure is the one that moves, and it is the right one to move: it is the
  // channel that goes unlabelled anyway on a full three-scale plot, where
  // temperature has the right and the crosshair gives the exact figure for any
  // instant. Three sets of numbers on one edge is unreadable.
  //
  // **A single scale goes on the left and the right edge stays empty.** There is
  // no side to protect when nothing shares the plot with it, the left is where
  // the eye goes for a primary axis, and it is where the gridlines are already
  // anchored. The two rules together: the left edge is labelled whenever
  // anything is plotted, and the right edge exactly when the plot holds a second
  // scale.
  const hasTwoScales = scales.length > 1;
  const leftChannel = hasTwoScales
    ? (verticalChannel ?? pressureChannel)
    : (scales[0] ?? null);
  // Reachable only with meters on the left, since two scales without temperature
  // means depth (or the ceiling) and pressure - so this can never hand pressure
  // to both edges at once.
  const rightChannel = hasTwoScales
    ? (temperatureChannel ?? pressureChannel)
    : null;

  // The water column: one filled region per run of consecutive depth samples,
  // from the surface down to the curve.
  //
  // Per segment, and built from the same `segments` the polylines are, which is
  // the whole of the fix. It was one path over `series.t` entire - every sample
  // the channel carried, dropouts included - so on a dive whose depth series has
  // a real hole in it the line broke where the recording stopped and the teal
  // fill went straight on across the gap underneath it. That is the one thing
  // `segmentByTimeGap` exists to prevent, stated on the line and contradicted by
  // the shape under it: a filled region is a claim that the diver was in that
  // water, and here it spanned the stretch where nothing was recorded at all.
  //
  // Real, not hypothetical - `Dive_2025-03-08-1440.xml` has a 1 341-second hole,
  // and the same class of bug was already found and fixed on the ceiling, which
  // has shaded per segment since it was added.
  const depthAreas =
    depthChannel?.segments.map((segment) =>
      buildAreaPath(
        segment.map((position) => ({
          x: x(depthChannel.series.t[position]),
          y: depthChannel.y(depthChannel.series.values[position]),
        })),
        PADDING.top,
      ),
    ) ?? [];

  // The forbidden zone: one filled region per run of consecutive ceiling
  // samples, from the surface down to the ceiling. That is the water the diver
  // may *not* ascend into, which is the thing worth shading - the ceiling line
  // alone says where the limit is without saying which side of it is the
  // problem. Per segment rather than one path over the whole channel, so a
  // stretch with no obligation is left unshaded instead of being spanned.
  const ceilingAreas =
    ceilingChannel?.segments.map((segment) =>
      buildAreaPath(
        segment.map((position) => ({
          x: x(ceilingChannel.series.t[position]),
          y: ceilingChannel.y(ceilingChannel.series.values[position]),
        })),
        PADDING.top,
      ),
    ) ?? [];

  // The marker the crosshair is close enough to be naming, if any. In seconds,
  // from a distance in viewBox units - see `EVENT_HOVER_UNITS`.
  const hoveredEvent =
    hoveredSeconds === null || !eventsShown
      ? null
      : nearestEvent(
          events,
          hoveredSeconds,
          (duration / PLOT_WIDTH) * EVENT_HOVER_UNITS,
        );

  // One binary search per channel, not one shared index lookup: the channels are
  // independently sampled, so each has its own nearest sample to the cursor's
  // instant. Every reported value is a real reading, never an interpolation -
  // and `sampleIndexAt` is what keeps that true across a stretch a channel
  // didn't record, where the nearest reading is not a reading *here* at all. A
  // channel simply drops out of the card there, exactly as its line drops out of
  // the plot.
  const readouts: Readout[] =
    hoveredSeconds === null
      ? []
      : shown
          .map((channel): Readout | null => {
            // The nearest sample that is both close enough to quote and actually
            // on the chart - one question, not two, so a nearer *undrawn* sample
            // can't mask a drawn one just behind it. See `drawnSampleIndexAt`.
            const index = drawnSampleIndexAt(
              channel.series.t,
              hoveredSeconds,
              channel.gapSeconds,
              channel.drawn,
            );
            if (index < 0) return null;
            return {
              key: channel.key,
              label: channel.label,
              channel: channel.series.channel,
              seconds: channel.series.t[index],
              value: channel.series.values[index],
              cy: channel.y(channel.series.values[index]),
            };
          })
          .filter((readout): readout is Readout => readout !== null);

  return (
    <div>
      {/* Wide content scrolls in its own container rather than shrinking the
          whole chart to phone width, where three axes' labels would become
          unreadable - the same treatment the gas chart and the gas mixtures
          table get. The legend deliberately sits *outside* it: it's text, so it
          should wrap to the screen rather than scroll sideways with the plot,
          and on a phone the container's own horizontal scrollbar is drawn
          across the bottom of whatever it contains - straight through the
          legend. */}
      {/* `relative` at the *viewport's* width rather than the plot's, which is
          what the empty-plot message below is positioned against. Centring it on
          the 560-unit plot box instead puts it at x≈280 of a box that is wider
          than a phone, so on a 375 px screen the sentence starts near the right
          edge and runs off it - and the one thing that has to be readable
          without scrolling is the sentence explaining why there is nothing to
          scroll to. */}
      <div className="relative">
        <div className="overflow-x-auto">
          {/* Sized to exactly the chart, and the positioning context the
              tooltip's percentage offsets are resolved against. */}
          <div className="relative min-w-[560px]">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="w-full h-auto"
              role="img"
              // Only what's on screen. A summary naming a temperature range the
              // diver has hidden describes a chart nobody is looking at.
              aria-label={describeProfile({
                depth: shownValues("depth"),
                ceiling: shownValues("ceiling"),
                temperature: shownValues("temperature"),
                pressure: shownValues("pressure"),
                // Emptied rather than filtered, since the toggle is all-or-nothing
                // - and this is the same "only what's on screen" rule the four
                // channels above go through `shownValues` for.
                events: eventsShown ? events : [],
                duration,
                units,
              })}
            >
              {/* Horizontal gridlines, from the left-hand axis, so every rule
              lines up with a labelled value rather than floating between two.
              `currentColor` throughout, so light/dark is inherited from the
              surrounding text colors rather than hardcoded per theme.

              `aria-hidden`, here and on the two axes below: an axis is a
              reading aid for the eye, and `role="img"` on the svg does not
              reliably keep bare `<text>` out of the accessibility tree - it
              surfaces as a run of unlabelled numbers ahead of anything useful.
              `describeProfile` on the svg says what they say, in a sentence. */}
              {leftChannel &&
                axisTicks(leftChannel.domain).map((tick) => (
                  <line
                    key={tick}
                    aria-hidden
                    className="text-border"
                    x1={PADDING.left}
                    x2={WIDTH - PADDING.right}
                    y1={leftChannel.y(tick)}
                    y2={leftChannel.y(tick)}
                    stroke="currentColor"
                    strokeWidth={1}
                  />
                ))}

              {/* The primary scale, labelled in the colour of whichever channel
              is holding it - see `leftChannel` for which one that is and why
              it is never nothing while a curve is on the plot. */}
              {leftChannel &&
                axisTicks(leftChannel.domain).map((tick) => (
                  <text
                    key={tick}
                    aria-hidden
                    x={PADDING.left - 6}
                    y={leftChannel.y(tick)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={11}
                    fill="currentColor"
                    className={leftChannel.series.channel.colorClass}
                  >
                    {tick}
                  </text>
                ))}

              {/* The second scale, where the selection holds one - see
              `rightChannel`. */}
              {rightChannel &&
                axisTicks(rightChannel.domain).map((tick) => (
                  <text
                    key={tick}
                    aria-hidden
                    x={WIDTH - PADDING.right + 6}
                    y={rightChannel.y(tick)}
                    textAnchor="start"
                    dominantBaseline="middle"
                    fontSize={11}
                    fill="currentColor"
                    className={rightChannel.series.channel.colorClass}
                  >
                    {tick}
                  </text>
                ))}

              {elapsedTicks(duration).map((tick) => (
                <text
                  key={tick}
                  aria-hidden
                  x={x(tick)}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  className="text-muted-foreground"
                >
                  {formatDurationForForm(tick)}
                </text>
              ))}

              {/* Depth is the chart's subject, so it gets a filled area under the
              curve - which also makes "which side is the water" unambiguous on
              an inverted axis - and everything else is a bare line on top. The
              fill is what marks it out, not a heavier stroke: every channel is
              drawn at the same weight. One per run, so the fill breaks wherever
              the line does. */}
              {depthAreas.map((area, index) => (
                <path
                  key={index}
                  d={area}
                  fill="currentColor"
                  className={`${PROFILE_CHANNELS.depth.colorClass} opacity-15`}
                />
              ))}

              {/* Over the depth fill, not under it: the ceiling zone is a subset
              of the water column by construction - a ceiling is always
              shallower than the depth it was computed at - so underneath it
              would be invisible. Denser than depth's 15% for the same reason it
              is red: this is the one region on the chart that is a rule rather
              than a reading. */}
              {ceilingAreas.map((area, index) => (
                <path
                  key={index}
                  d={area}
                  fill="currentColor"
                  className={`${PROFILE_CHANNELS.ceiling.colorClass} opacity-25`}
                />
              ))}

              {shown.map((channel) => (
                <g
                  key={channel.key}
                  className={channel.series.channel.colorClass}
                >
                  {channel.segments.map((segment, index) => (
                    <polyline
                      key={index}
                      points={segment
                        .map(
                          (position) =>
                            `${x(channel.series.t[position])},${channel.y(channel.series.values[position])}`,
                        )
                        .join(" ")}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      // From the channel rather than from this line's key, so the
                      // legend swatch below can read the same flag - see `dashed`
                      // on `ProfileChannel` for why the dash is load-bearing.
                      strokeDasharray={
                        channel.series.channel.dashed ? "5 3" : undefined
                      }
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}
                </g>
              ))}

              {/* Event markers, on the axis rather than on the depth curve, and
              behind a switch of their own in the legend. They are still not a
              channel - no axis, no unit, nothing to scale - and the switch does
              not make them one; what it grants is that a dive with a dozen of
              them can be read without them, which "annotations are cheap enough
              to always draw" was the wrong answer to. See `PROFILE_VIEW_KEYS`
              for why they are a separate list rather than a fifth channel. */}
              {eventsShown &&
                events.map((event, index) => (
                  <EventMarker
                    key={`${event.t}-${event.type}-${index}`}
                    event={event}
                    cx={x(event.t)}
                    hovered={event === hoveredEvent}
                  />
                ))}

              {hoveredSeconds !== null && (
                <line
                  x1={x(hoveredSeconds)}
                  x2={x(hoveredSeconds)}
                  y1={PADDING.top}
                  y2={PLOT_BOTTOM}
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-muted-foreground"
                />
              )}

              {readouts.map((readout) => (
                <circle
                  key={readout.key}
                  cx={x(readout.seconds)}
                  cy={readout.cy}
                  r={3.5}
                  fill="currentColor"
                  className={readout.channel.colorClass}
                />
              ))}

              {/* One transparent hit target over the whole plot. The gas chart hangs
              its hover off per-dot `<a>` elements; a continuous line has no dots
              to hang anything off, so the analogue is a rect that turns the
              cursor's x into a time. `transparent` rather than `none` -
              `fill="none"` takes no pointer events at all, which is the opposite
              of the point.

              Keyboard scrubbing is deliberately out of scope: the gas chart gets
              focus for free from the links its dots already are, and there is no
              equivalent here without inventing a focus model for a polyline. The
              `aria-label` above carries the summary instead. */}
              <rect
                x={PADDING.left}
                y={PADDING.top}
                width={PLOT_WIDTH}
                height={PLOT_HEIGHT}
                fill="transparent"
                onMouseMove={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const ratio = (event.clientX - bounds.left) / bounds.width;
                  setHoveredSeconds(
                    Math.min(duration, Math.max(0, ratio * duration)),
                  );
                }}
                onMouseLeave={() => setHoveredSeconds(null)}
              />
            </svg>

            {hoveredSeconds !== null &&
              (readouts.length > 0 || hoveredEvent) && (
                <ProfileTooltip
                  seconds={hoveredSeconds}
                  readouts={readouts}
                  event={hoveredEvent}
                  cx={x(hoveredSeconds)}
                  // The topmost of the dots being described, which is only used to
                  // decide which end of the plot the card sits at - see
                  // `tooltipVerticalAnchor`. `PLOT_BOTTOM` is the degenerate
                  // fallback for a card with an event and no readouts to hang off,
                  // which puts it at the top, clear of the marker on the baseline.
                  topmostY={
                    readouts.length > 0
                      ? Math.min(...readouts.map((readout) => readout.cy))
                      : PLOT_BOTTOM
                  }
                />
              )}
          </div>
        </div>

        {/* Switching the last channel off used to return a bare sentence in
            place of the whole chart, which collapsed the card to two lines and
            dragged the legend - the only way back - up the page after it. The
            plot stays: same box, same elapsed-time axis, with the sentence over
            the middle of it. Nothing moves, and the toggle that undid this is
            still under the cursor that clicked it.

            A sibling of the scroll container rather than a child of the plot
            box, so it centres on what the diver can see - see the note on the
            `relative` wrapper above.

            Not shown while the markers are up, even with every curve hidden: the
            plot has content then, and "pick one below to plot it" printed across
            a row of markers describes a chart nobody is looking at.

            `pointer-events-none` so the hit target underneath still tracks the
            crosshair, which markers are still worth hovering for - and so the
            plot underneath can still be scrolled sideways. */}
        {shown.length === 0 && !eventsShown && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Every channel is hidden. Pick one below to plot it.
            </p>
          </div>
        )}
      </div>

      <LegendToggles
        available={available}
        visible={visible}
        onToggle={toggle}
        units={units}
      />
    </div>
  );
}

interface Readout {
  key: string;
  label: string;
  channel: (typeof PROFILE_CHANNELS)[keyof typeof PROFILE_CHANNELS];
  seconds: number;
  value: number;
  cy: number;
}

// How a marker is drawn, by what it means. Three families rather than five
// glyphs: at this size a shape is worth about one bit of information, and
// spending it on "is this the gas plan, an obligation, or the computer talking"
// is worth more than five outlines nobody can tell apart. The readout says which
// one it is in words.
//
// Colours are borrowed, not new, and they answer a narrower question than the
// shapes do: **does this marker join to something else on the chart?** A gas
// switch is violet because that is the cylinders' colour here and the marker
// carries the `gas_number` that joins it to one. Nothing else joins to anything,
// so nothing else is coloured.
//
// A stop is deliberately *not* drawn in the ceiling's red, which is what an
// earlier version did on the grounds that "a stop is the obligation the ceiling
// describes". That is not true of either type this build can receive. Both reach
// us through `_STOP_TYPE_BY_NOTIFY` in the API's `suunto_json.py`, which maps
// them from Suunto `Notify` values - the computer *recommending* a pause, not a
// ceiling forbidding an ascent. A safety stop is the clearest case: it is
// precisely the stop that is not an obligation, and a red triangle in the
// forbidden zone's exact colour would put an obligation on a recreational
// no-deco profile that never had one. Red means the ceiling, and only the
// ceiling.
interface EventGlyph {
  colorClass: string;
  shape: "diamond" | "triangle" | "circle";
}

const EVENT_GLYPHS: Record<DiveProfileEvent["type"], EventGlyph> = {
  gas_switch: { colorClass: "text-pressure", shape: "diamond" },
  deep_stop: { colorClass: "text-muted-foreground", shape: "triangle" },
  safety_stop: { colorClass: "text-muted-foreground", shape: "triangle" },
  bookmark: { colorClass: "text-muted-foreground", shape: "circle" },
  other: { colorClass: "text-muted-foreground", shape: "circle" },
};

// What a type this build has never heard of is drawn as.
//
// `event.type` is a `string` on the wire that TypeScript has been told is one of
// five, and the two repos deploy independently: an API that grows a sixth
// `ProfileEventType` reaches browsers still running this bundle. Indexing
// `EVENT_GLYPHS` with it then yields `undefined`, and destructuring that is a
// `TypeError` inside render - which, with no `error.tsx` anywhere under
// `src/app`, takes out the whole dive detail route rather than one tick. A
// neutral grey circle is the honest degradation, and `describeEvent` falls back
// to the device's own wording beside it. The `as` is doing the opposite of its
// usual job here: it exists so the `??` is reachable, not to silence it.
const UNKNOWN_EVENT_GLYPH: EventGlyph = {
  colorClass: "text-muted-foreground",
  shape: "circle",
};

function glyphFor(type: string): EventGlyph {
  return EVENT_GLYPHS[type as DiveProfileEvent["type"]] ?? UNKNOWN_EVENT_GLYPH;
}

// One marker: a tick standing on the x-axis with its glyph on top.
//
// `aria-hidden` like the axes - `role="img"` on the parent svg doesn't reliably
// keep shapes out of the accessibility tree, and `describeProfile` names the
// events in a sentence, which a run of unlabelled paths never could.
function EventMarker({
  event,
  cx,
  hovered,
}: {
  event: DiveProfileEvent;
  cx: number;
  hovered: boolean;
}) {
  const { colorClass, shape } = glyphFor(event.type);
  const cy = PLOT_BOTTOM - EVENT_TICK_HEIGHT - EVENT_GLYPH_GAP;
  const r = EVENT_GLYPH_RADIUS;

  return (
    <g
      aria-hidden
      className={colorClass}
      // Dimmed until the crosshair is near one, and then only *this* one comes
      // up. Markers are the chart's background layer of annotation: at full
      // strength a dive with a dozen of them reads as a picket fence in front of
      // the curves it is annotating.
      //
      // 0.9 rather than the 0.55 this started at, because opacity composites
      // away exactly the contrast the tokens were chosen for, and a resting
      // marker is the only affordance there is - you cannot hover what you
      // cannot see, so this is the one place on the chart where a faint mark
      // fails the person it matters most to.
      //
      // Composited against the card the markers actually sit on, 0.55 puts
      // `--ceiling` at **1.94:1** and `--pressure` at **2.01:1** in dark and
      // `--muted-foreground` at **2.37:1** in light - all under the 3:1 WCAG
      // asks of a graphical object, despite every one of those tokens clearing
      // it on its own. 0.9 brings the worst case to **3.27:1** and leaves real
      // headroom; 0.85 would clear at 3.05:1, which is close enough to the line
      // that a rounding difference in compositing could put it under.
      //
      // The picket-fence worry is answered by the marks being thin ticks on the
      // baseline rather than by making them faint, and the hover still reads: it
      // takes the tick to full strength *and* thickens it, which was always
      // doing more of that work than the opacity was.
      opacity={hovered ? 1 : 0.9}
    >
      <line
        x1={cx}
        x2={cx}
        y1={PLOT_BOTTOM}
        y2={PLOT_BOTTOM - EVENT_TICK_HEIGHT}
        stroke="currentColor"
        strokeWidth={hovered ? 1.5 : 1}
      />
      {shape === "diamond" && (
        <path
          d={`M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`}
          fill="currentColor"
        />
      )}
      {shape === "triangle" && (
        <path
          d={`M${cx},${cy - r} L${cx + r},${cy + r - 1} L${cx - r},${cy + r - 1} Z`}
          fill="currentColor"
        />
      )}
      {shape === "circle" && (
        <circle cx={cx} cy={cy} r={r - 1} fill="currentColor" />
      )}
    </g>
  );
}

// The hover card: HTML rather than SVG `<text>`, so it gets the app's tooltip
// tokens, a border, a shadow and crisp text at any chart width - the same call,
// and the same tokens, as `GasUseTooltip`.
//
// Positioned in percentages of the chart box, which works because the SVG scales
// uniformly inside a wrapper of exactly its size, so viewBox units map straight
// onto percentages without measuring anything in the DOM. The `style` prop is an
// inline style *attribute*, which the CSP allows (`style-src-attr
// 'unsafe-inline'`); an injected `<style>` element would not be.
function ProfileTooltip({
  seconds,
  readouts,
  event,
  cx,
  topmostY,
}: {
  seconds: number;
  readouts: Readout[];
  event: DiveProfileEvent | null;
  cx: number;
  topmostY: number;
}) {
  // The card always lands inside the chart box, in both axes. It has to: the
  // scroll container around it clips (setting `overflow-x` to `auto` makes
  // `overflow-y` compute to `auto` as well), so anything hanging past an edge is
  // cut off or adds a stray scrollbar.
  //
  // Vertically that is guaranteed by anchoring to the plot's own top or bottom
  // edge rather than offsetting from a data point - see `tooltipVerticalAnchor`
  // for why offsetting from a point cannot be made safe here. Horizontally the
  // card is centred on the crosshair and flips to hug whichever edge it is near,
  // which is safe because its width is bounded by `whitespace-nowrap` on short
  // readouts.
  const { y, translateY } = tooltipVerticalAnchor(
    topmostY,
    PADDING.top,
    PLOT_BOTTOM,
  );
  const translateX =
    cx < WIDTH * 0.2
      ? "-12px"
      : cx > WIDTH * 0.8
        ? "calc(-100% + 12px)"
        : "-50%";

  return (
    <div
      // Never a hover target itself - it sits over the plot, and letting it take
      // the pointer would make it flicker as it steals its own trigger's hover.
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-white/10 bg-tooltip px-3 py-2 text-tooltip-foreground shadow-lg"
      style={{
        left: `${(cx / WIDTH) * 100}%`,
        top: `${(y / HEIGHT) * 100}%`,
        transform: `translate(${translateX}, ${translateY})`,
      }}
      role="presentation"
    >
      <div className="text-xs text-tooltip-foreground/70">
        {formatDurationForForm(Math.round(seconds))} elapsed
      </div>
      {readouts.map((readout) => (
        <div key={readout.key} className="mt-0.5 text-sm">
          <span className={`${readout.channel.colorClass} font-semibold`}>
            {formatChannelValue(readout.value, readout.channel)}
          </span>{" "}
          <span className="text-tooltip-foreground/70">{readout.label}</span>
        </div>
      ))}
      {event && (
        // Under the readings, with a rule above it: a marker is a different kind
        // of statement from a sensor value, and the card is showing both at an
        // instant where they merely coincide.
        //
        // `whitespace-normal` against the card's own `nowrap`, and a width to
        // wrap inside. An `other`'s text comes off the uploaded file - the only
        // free text on this chart - and while the API caps it at 120 characters,
        // 120 characters on one line is several times the plot's width and would
        // be clipped by the scroll container the card sits in.
        <div className="mt-1.5 max-w-64 whitespace-normal border-t border-white/10 pt-1.5 text-sm">
          <span className={`${glyphFor(event.type).colorClass} font-semibold`}>
            {describeEvent(event)}
          </span>
        </div>
      )}
    </div>
  );
}

// The legend, and the control for what's plotted.
//
// One and the same thing deliberately: the legend already names every curve and
// carries its color, so it is where you look to ask "which line is which" - and
// "hide that one" is the next thought. A separate row of checkboxes above the
// chart would say the same words twice.
//
// One toggle per *channel*, not per plotted line, which is only a distinction on
// a dive with two cylinders. Both pressure lines draw in the same `--pressure`
// violet, so listing them separately never distinguished them by eye anyway, and
// the crosshair readout still names each cylinder ("Tank pressure (gas 2)").
// Toggling by channel is also what makes the choice worth remembering: "gas 2"
// means a different cylinder on the next dive, while "tank pressure" doesn't.
//
// The markers get an entry too, last, and it is the one that is not a curve -
// see `PROFILE_VIEW_KEYS`. Putting it here rather than anywhere else on the card
// follows from the same pact as the rest: *"Both charts' legends are the control
// for what they plot"*, and a marker switch sitting somewhere else would be the
// first thing on this chart you could turn off from outside its legend.
function LegendToggles({
  available,
  visible,
  onToggle,
  units,
}: {
  available: readonly ProfileViewKey[];
  visible: readonly ProfileViewKey[];
  onToggle: (key: ProfileViewKey) => void;
  units: UnitSystem;
}) {
  return (
    <div
      className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"
      role="group"
      // Named for what this dive's legend actually holds. Most dives carry no
      // markers and get no switch for them, and a group announcing a control it
      // does not contain is the same disagreement the chart polices everywhere
      // else, one level up in the accessibility tree.
      aria-label={
        available.includes("events") ? "Channels and markers" : "Channels"
      }
    >
      {available.map((key) => {
        const channel =
          key === "events"
            ? null
            : displayChannel(PROFILE_CHANNELS[key], units);
        const on = visible.includes(key);

        return (
          <button
            key={key}
            type="button"
            // `aria-pressed` rather than a checkbox: these are buttons that
            // change the picture in place, and the pressed state is what a
            // screen reader needs to hear. The label stays the channel's name
            // in both states - "Show Depth" on a control that is currently
            // showing depth reads as a description of what it does, not of what
            // it is, and `aria-pressed` already carries the rest.
            aria-pressed={on}
            onClick={() => onToggle(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "text-muted-foreground" : "text-muted-foreground/50",
            )}
          >
            {channel ? (
              <span
                aria-hidden
                className={cn(
                  "inline-block w-4",
                  // A dashed curve gets a dashed swatch. The legend is the only
                  // thing that says the red dashed line is the ceiling, so a
                  // solid swatch beside it would be describing a curve that
                  // isn't on the chart - and the dash is what separates the
                  // ceiling from temperature when hue alone is close (see
                  // `--ceiling`).
                  //
                  // A top border rather than a background, because CSS has no
                  // way to dash a fill: `border-current` picks up the same
                  // `currentColor` `bg-current` does, so both branches inherit
                  // the colour the same way.
                  channel.dashed
                    ? "border-t-2 border-dashed border-current"
                    : "h-0.5 rounded-full bg-current",
                  // Hidden channels keep their swatch, in the button's own
                  // muted color rather than the channel's: a grey line where the
                  // teal one was is the whole of "this is off, and this is what
                  // it would be".
                  on && channel.colorClass,
                )}
              />
            ) : (
              // The markers' swatch is a mark, not a line, because that is what
              // they are on the plot - a swatch of the same width so the labels
              // stay in one column, with the glyph centred in it.
              //
              // A circle rather than the diamond or the triangle: those two mean
              // "gas switch" and "a stop" specifically, and one entry standing
              // for all five types has no business claiming to be one of them.
              // The circle is already what the two general types draw, and the
              // crosshair names the particular one in words.
              //
              // Deliberately uncoloured in both states, unlike every swatch
              // above. Marker colour answers "does this join to something else
              // on the chart" - only a gas switch does, in the cylinders' violet
              // - so a coloured legend swatch would be making that claim on
              // behalf of the four types for which it is false.
              <span aria-hidden className="inline-flex w-4 justify-center">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              </span>
            )}
            {channel ? `${channel.label} (${channel.unit})` : EVENTS_LABEL}
          </button>
        );
      })}
    </div>
  );
}

// The chart's accessible name. The visual tooltip says nothing to a screen
// reader, so this has to carry the shape of the dive on its own.
function describeProfile({
  depth,
  ceiling,
  temperature,
  pressure,
  events,
  duration,
  units,
}: {
  // Readings that are on screen, in display units - not the channels' raw
  // series. Every one of these is fed through `drawnValues`, because this
  // function's whole output is extremes and an extreme taken over samples the
  // chart declined to draw describes a curve nobody can see. An empty array is
  // "this channel is not on screen", which covers hidden, absent and too-sparse
  // with one check.
  depth: number[];
  ceiling: number[];
  temperature: number[];
  pressure: number[];
  events: readonly DiveProfileEvent[];
  duration: number;
  // The system those readings are already in, so this can name it. Spelled out
  // rather than abbreviated throughout - "ft" is read aloud as a word and "°C"
  // not at all, which is the whole reason `unitWord` exists.
  units: UnitSystem;
}): string {
  // `formatDurationHoursMinutes` here rather than the axis's `MM:SS`: read aloud,
  // "84:36" is not a length of time, whereas "1h 25min" is. The axis keeps
  // `MM:SS`, which is what a dive profile's elapsed scale conventionally shows.
  const parts = [`Dive profile over ${formatDurationHoursMinutes(duration)}`];

  // At the channel's own resolution, which is the same rule the crosshair follows
  // and the same one the numbers were stored under.
  const say = (key: ProfileChannelKey, value: number) =>
    value.toFixed(displayChannel(PROFILE_CHANNELS[key], units).decimals);

  if (depth.length > 0) {
    parts.push(
      `maximum depth ${say("depth", Math.max(...depth))} ${channelWord("depth", units)}`,
    );
  }
  if (ceiling.length > 0) {
    // The deepest ceiling, which is the one number that says how much
    // decompression this dive owed at its worst.
    parts.push(
      `deco ceiling to ${say("ceiling", Math.max(...ceiling))} ${channelWord("ceiling", units)}`,
    );
  }
  if (temperature.length > 0) {
    parts.push(
      `temperature ${say("temperature", Math.min(...temperature))} to ${say(
        "temperature",
        Math.max(...temperature),
      )} ${channelWord("temperature", units)}`,
    );
  }
  if (pressure.length > 0) {
    parts.push(
      `tank pressure ${say("pressure", Math.max(...pressure))} down to ${say(
        "pressure",
        Math.min(...pressure),
      )} ${channelWord("pressure", units)}`,
    );
  }

  // Spelled out rather than counted, unlike the channels above, because this is
  // the one thing on the chart a sighted reader gets by hovering - and hovering
  // is exactly what this label exists in place of. A curve's shape genuinely
  // can't be read aloud, so its extremes are the honest summary; a list of five
  // markers can be, and "5 markers" would be withholding it.
  //
  // Capped all the same: the API allows 200, and a label that long is not a
  // summary of anything. The real dives in the corpus produce a handful.
  //
  // Sorted before slicing, because "the first eight" only means "the first eight
  // of the dive" on a list that arrived in time order. `nearestEvent` goes out of
  // its way not to assume that (it is a scan for exactly that reason), and two
  // functions in one file taking opposite stances on the same input is how the
  // weaker assumption eventually wins. The API does sort in `_rebase_events`, so
  // this reorders nothing today; at n <= 200 it costs nothing to not depend on it.
  if (events.length > 0) {
    const named = [...events]
      .sort((first, second) => first.t - second.t)
      .slice(0, MAX_DESCRIBED_EVENTS)
      .map(
        (event) =>
          `${describeEvent(event)} at ${formatDurationHoursMinutes(event.t)}`,
      );
    if (events.length > named.length) {
      named.push(`and ${events.length - named.length} more`);
    }
    parts.push(`markers: ${named.join(", ")}`);
  }

  return `${parts.join(", ")}.`;
}
