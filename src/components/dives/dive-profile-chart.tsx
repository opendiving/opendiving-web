"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  DiveProfile,
  DiveProfileEvent,
  DiveProfileEventType,
} from "@/lib/api/dives";
import { axisTicks, niceDomain, type Domain } from "@/lib/chart-scale";
import { buildAreaPath } from "@/lib/chart-path";
import {
  type ChannelSeries,
  type ProfileAxisKey,
  type ProfileChannel,
  type ProfileChannelKey,
  type ProfileSeriesKey,
  type ProfileViewKey,
  EVENTS_LABEL,
  PANEL_AXES,
  PROFILE_CHANNELS,
  PROFILE_CHANNEL_KEYS,
  PROFILE_VIEW_KEYS,
  axisDomain,
  axisUnitSuffix,
  channelWord,
  channelsOnAxis,
  depthDomain,
  displayChannel,
  describeEvent,
  elapsedTicks,
  formatChannelValue,
  drawnSampleIndexAt,
  gapThreshold,
  nearestEvent,
  profileScalePlacement,
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
// Ten channels, ten colors, all of them theme-stable tokens declared once in
// `globals.css` and never redeclared under `.dark` (see the note on `--pressure`
// there). `--primary` would not do: it is near-black in light mode and a mid
// grey in dark, which left the gas chart's trend line barely visible.

// The viewBox coordinate space. Not pixels: the SVG scales to its container, so
// these are only ever ratios to each other.
const WIDTH = 720;
// Wider on both sides than the gas chart: depth is on the left and temperature
// and pressure share the right, so both margins carry axis labels.
const PADDING = { top: 14, right: 46, bottom: 28, left: 44 };

const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = 238;
const PLOT_BOTTOM = PADDING.top + PLOT_HEIGHT;

// The deco panel: one short plot per unit the depth plot's two edges cannot
// carry, stacked under it and sharing its elapsed-time axis. See
// `profileScalePlacement` for why the split is forced rather than chosen.
//
// Each row is its own plot with its own left-hand scale, so the depth plot's
// edges are untouched by anything the diver switches on down here, and every
// curve on the chart is drawn against numbers that belong to it.
const PANEL_HEIGHT = 46;
const PANEL_GAP = 12;

const panelTop = (index: number) =>
  PLOT_BOTTOM + PANEL_GAP + index * (PANEL_HEIGHT + PANEL_GAP);

// Where the drawing stops, and how tall the viewBox is. Both grow with the
// panel count, which is why neither is a module constant: with no panel this is
// the 280-unit box the chart has always been.
const chartBottom = (panelCount: number) =>
  panelCount === 0 ? PLOT_BOTTOM : panelTop(panelCount - 1) + PANEL_HEIGHT;
const chartHeight = (panelCount: number) =>
  chartBottom(panelCount) + PADDING.bottom;

// Display value -> y, in one rect. The `inverted` flag is depth's: it grows
// downward from the surface, so its axis is upside down relative to every other
// scale on the chart.
const scaleY =
  (domain: Domain, top: number, height: number, inverted: boolean) =>
  (value: number) => {
    const fraction = (value - domain.min) / (domain.max - domain.min);
    return top + (inverted ? fraction : 1 - fraction) * height;
  };

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
  // Which of the legend's toggles this line belongs to. Not the same as `key`:
  // two cylinders are two lines and one channel.
  channelKey: ProfileChannelKey;
  // Which scale it is drawn against, which also decides *where* it is drawn -
  // the depth plot for the first three, a row of the deco panel for the rest.
  axis: ProfileAxisKey;
  label: string;
  series: ChannelSeries;
  // The domain this line is scaled against, kept alongside it so the axis labels
  // and gridlines can read the same one the curve was drawn with rather than
  // recomputing one and hoping it matches. It wouldn't, for pressure: every
  // cylinder shares one domain across all of them.
  //
  // **Null on a deco channel, where it cannot be known yet**: a panel row's scale
  // is taken over the channels on that row that are *shown*, and nothing here has
  // seen the selection. See the positioning step for why that differs from
  // `depthDomain`'s rule.
  domain: Domain | null;
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

// The same channel once the selection is known, and therefore once there is a
// scale and a rect to map it into. Neither `y` nor a concrete `domain` can sit on
// `PlottedChannel`: a deco channel's row, and the numbers down the side of it,
// both depend on which *other* deco channels are switched on, and `channels` is
// built before any of that is decided.
type PositionedChannel = Omit<PlottedChannel, "domain"> & {
  domain: Domain;
  y: (value: number) => number;
  // Which row of the deco panel this line is drawn in, or -1 for the depth plot.
  // Kept rather than recomputed at each of the three places that need it, one of
  // which is the clip that holds a curve inside its row - see `panelClip`.
  panelIndex: number;
};

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
  // Names the clip paths below, so two charts on one page cannot clip each other
  // - the trap `components/icons/google-icon.tsx` already records for the mask and
  // filter ids it namespaces the same way.
  //
  // Reduced to letters, digits and dashes rather than used as `useId` hands it
  // over. React 19 spells an id `«r0»`, and 18 spelled it `:r0:`; both are legal
  // in an `id` attribute and neither is legal unescaped in the `url(#...)`
  // fragment that has to resolve it. What survives the strip is still the part
  // that differs between two ids on one page.
  const clipPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
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

  const duration = profile.duration;
  const x = (seconds: number) =>
    PADDING.left + (duration > 0 ? seconds / duration : 0) * PLOT_WIDTH;

  // Markers that land inside the plot, which is this chart's job rather than the
  // API's and is stated as such at the other end: `_rebase_events` clamps the low
  // side at zero, deliberately leaves the high side alone - the profile's
  // `duration` is the span of the *samples*, and a device goes on recording after
  // the last one, so a FIT `user_marker` pressed after surfacing happened when the
  // file says it did - and signs off with "a chart that draws past its x domain is
  // the chart's to clip". This is that clip. The DiveJSON spec blesses the same
  // arrangement (§6.4), so the rename that brought `duration` here changed the
  // word and nothing about which markers exist.
  //
  // Dropped rather than clamped to the last second, which would invent a time to
  // keep a marker on screen, and rather than left to the SVG's own clipping,
  // which is not clipping at all: `x(time)` past `duration` lands in the
  // right-hand axis-label gutter first (aligned with no time on the axis) and only
  // leaves the viewBox further out.
  //
  // One filtered list feeds all three consumers - the glyphs, the crosshair and
  // `describeProfile` - so the picture and the accessible summary cannot disagree
  // about what the chart contains. That disagreement is the actual bug here: a
  // marker invisible to the eye but named to a screen reader.
  const events = (profile.events ?? []).filter(
    (event) => event.time >= 0 && event.time <= duration,
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
    // filtering them out would leave a depth-only dive rendering "this
    // recording's file recorded no samples to plot" over a profile that has two.
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

    if (depth && depthRuns) {
      plotted.push({
        key: "depth",
        channelKey: "depth",
        axis: "depth",
        label: PROFILE_CHANNELS.depth.label,
        series: depth,
        domain: vertical,
        ...depthRuns,
      });
    }

    if (ceiling && ceilingRuns) {
      plotted.push({
        key: "ceiling",
        channelKey: "ceiling",
        axis: "depth",
        label: PROFILE_CHANNELS.ceiling.label,
        series: ceiling,
        domain: vertical,
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
      plotted.push({
        key: "temperature",
        channelKey: "temperature",
        axis: "temperature",
        label: PROFILE_CHANNELS.temperature.label,
        series: temperature,
        domain: niceDomain(temperature.values),
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
          axis: "pressure",
          label:
            pressure.length > 1
              ? `${PROFILE_CHANNELS.pressure.label} (gas ${cylinder.gasNumber})`
              : PROFILE_CHANNELS.pressure.label,
          series: cylinder,
          domain,
          ...runs(cylinder.t, PROFILE_CHANNELS.pressure),
        });
      }
    }

    // The deco panel's channels, one axis at a time. Nothing here is special-
    // cased per channel: they differ from the four above only in sharing an axis
    // with whichever siblings carry the same unit, so the loop is over the axes
    // and the channels fall out of `channelsOnAxis`.
    for (const axis of PANEL_AXES) {
      const built = channelsOnAxis(PROFILE_CHANNEL_KEYS, axis)
        // Tank pressure is the one channel the API serves as a list rather than
        // a series, and it never lands in a panel - this is what says so to the
        // type system rather than to a reader only.
        .filter((key): key is ProfileSeriesKey => key !== "pressure")
        .map((key) => {
          const series = toChannelSeries(profile, key, units);
          return series
            ? { key, series, ...runs(series.t, PROFILE_CHANNELS[key]) }
            : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      for (const entry of built) {
        plotted.push({
          key: entry.key,
          channelKey: entry.key,
          axis,
          label: PROFILE_CHANNELS[entry.key].label,
          series: entry.series,
          // Decided in the positioning step, from the channels on this row that
          // are actually shown.
          domain: null,
          segments: entry.segments,
          gapSeconds: entry.gapSeconds,
          drawn: entry.drawn,
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
        This recording&apos;s file recorded no samples to plot.
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

  // Where this selection's scales land: which channel labels each edge of the
  // depth plot, and which rows the deco panel grows. Derived from the keys alone
  // (`profileScalePlacement`) so the rule can be swept over every one of the
  // 1 024 selections in a unit test rather than sampled by rendering.
  const placement = profileScalePlacement(
    availableChannels.filter((key) => visible.includes(key)),
  );

  // One scale per panel row, over the channels on that row that are **shown** -
  // which is deliberately not the rule `depthDomain` follows for depth and the
  // ceiling.
  //
  // There the hidden channel's values go in whether or not it is plotted, so the
  // axis does not shift under the diver's eyes when the ceiling is toggled; it
  // costs nothing, because a ceiling is always shallower than the depth it was
  // computed at. Here it would cost the row: a Suunto's `gf99` reaches five
  // figures on a decompression ascent, and letting a hidden gradient factor set
  // the percent row's scale would draw a CNS clock of 23 % as a flat line on the
  // baseline. A gradient factor is not a bound on a CNS clock the way a ceiling
  // is a bound on depth, so there is nothing to buy the stillness with.
  //
  // `axisDomain` rather than `niceDomain`, which is what stops a *shown* one
  // doing the same damage: the percent axis declares a ceiling of 200 % and will
  // not scale past it whatever the readings say. The rule above still earns its
  // place under that ceiling - a hidden gradient factor could still take a CNS
  // row from 12 % to 200 % - so both hold at once.
  const panelDomains = new Map<ProfileAxisKey, Domain>(
    placement.panels.map((axis) => [
      axis,
      axisDomain(
        axis,
        channels
          .filter(
            (channel) =>
              channel.axis === axis && visible.includes(channel.channelKey),
          )
          .flatMap((channel) => drawnValues(channel.series, channel.drawn)),
      ),
    ]),
  );

  // The shown channels, now that there is a scale and a rect for each. A deco
  // channel's row is its axis's position among the panels, which is exactly the
  // thing that could not be known while `channels` was being built.
  const shown: PositionedChannel[] = channels
    .filter((channel) => visible.includes(channel.channelKey))
    .flatMap((channel) => {
      const panelIndex = placement.panels.indexOf(channel.axis);
      const domain = channel.domain ?? panelDomains.get(channel.axis);
      // Unreachable: a channel is either on the depth plot with a domain of its
      // own, or on a panel row that `placement` grew *because* it is shown.
      if (!domain) return [];

      const { inverted } = PROFILE_CHANNELS[channel.channelKey];
      return [
        {
          ...channel,
          domain,
          panelIndex,
          y:
            panelIndex >= 0
              ? scaleY(domain, panelTop(panelIndex), PANEL_HEIGHT, inverted)
              : scaleY(domain, PADDING.top, PLOT_HEIGHT, inverted),
        },
      ];
    });

  const chartFoot = chartBottom(placement.panels.length);
  const height = chartHeight(placement.panels.length);

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

  // The channel drawing a given toggle right now, or null. `find` rather than a
  // filter for pressure on purpose: every cylinder shares one domain and one y,
  // so any of them answers for the axis.
  const shownChannel = (key: ProfileChannelKey): PositionedChannel | null =>
    shown.find((channel) => channel.channelKey === key) ?? null;

  const depthChannel = shownChannel("depth");
  const ceilingChannel = shownChannel("ceiling");

  // Which channel labels each edge of the depth plot - the rule lives in
  // `profileScalePlacement`, and what is left here is looking the channel up.
  const leftChannel = placement.left ? shownChannel(placement.left) : null;
  const rightChannel = placement.right ? shownChannel(placement.right) : null;

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
              // Whether the reading is one this row's axis can hold - see
              // `axisDomain`. Only ever true on a bounded axis, and the value is
              // quoted either way: the card is the readout, and bounding an axis
              // is not licence to stop telling the diver what the device wrote.
              offScale:
                channel.series.values[index] < channel.domain.min ||
                channel.series.values[index] > channel.domain.max,
            };
          })
          .filter((readout): readout is Readout => readout !== null);

  // The subset of them with a dot on the chart. A reading the row's axis cannot
  // hold has no honest place to be marked: at its own `cy` the dot lands over the
  // depth plot, and pulled back to the row's top edge it would claim the curve is
  // up there, which is exactly the reading the bound exists to avoid making. The
  // curve says it left, and the card says what it left with.
  const dots = readouts.filter((readout) => !readout.offScale);

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
              viewBox={`0 0 ${WIDTH} ${height}`}
              className="w-full h-auto"
              role="img"
              // Only what's on screen. A summary naming a temperature range the
              // diver has hidden describes a chart nobody is looking at.
              aria-label={describeProfile({
                readings: shownValues,
                // Emptied rather than filtered, since the toggle is
                // all-or-nothing - and this is the same "only what's on screen"
                // rule the channels go through `shownValues` for.
                events: eventsShown ? events : [],
                duration,
                units,
              })}
            >
              {/* One clip per panel row, because a panel row's axis can declare a
              ceiling its readings overrun - see `axisDomain`, and DECISIONS.md's
              *"The percent axis stops at 200 %"*.

              A gradient factor of 14 060 % has to be drawn **leaving** a 200 %
              row. Held inside it instead, flattened along the top edge, it would
              read as a measurement at 200 %, which is the one thing it is not;
              left unclipped it would run up through the panel gap and across the
              depth plot. So the row clips, and the curve crosses its top rule at
              whatever angle it was climbing at and is gone.

              That is also what tells the two kinds of absence apart, which is
              worth saying because this chart cares elsewhere: a stretch the
              device never recorded leaves the line stopping *inside* the row,
              while a stretch the axis cannot hold leaves it stopping *on the top
              rule*. Different pictures, and neither invents a reading.

              Applied to every panel row, not only a bounded one: on an unbounded
              row the domain covers its own drawn values by construction, so there
              is nothing there for a clip to remove. The depth plot is left alone
              for the same reason and an extra one - its readout dots sit on its
              edges, and a clip would cut them in half.

              Not left to the SVG's own edge, which is not clipping at all: it
              hides what leaves the viewBox and happily draws what merely leaves a
              plot. That distinction is already recorded, under *"Markers are
              clipped to the plot"*. */}
              <defs aria-hidden>
                {placement.panels.map((axis, index) => (
                  <clipPath key={axis} id={`${clipPrefix}-panel-${index}`}>
                    <rect
                      x={PADDING.left}
                      y={panelTop(index)}
                      width={PLOT_WIDTH}
                      height={PANEL_HEIGHT}
                    />
                  </clipPath>
                ))}
              </defs>

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

              {/* The deco panel's rows: two rules and two numbers each, the
              upper one carrying the unit. Deliberately thinner than the depth
              plot's axis - `axisTicks` would put four or five labels in 46
              units, where 11-unit type collides with itself - and deliberately
              **not** coloured after a channel: three curves in different colours
              can share one of these rows, so numbers in any one of them would be
              claiming the scale for that curve. The depth plot's coloured-edge
              rule holds where it was written, on an edge one channel owns. */}
              {placement.panels.map((axis) => {
                const row = shown.find((channel) => channel.axis === axis);
                if (!row) return null;
                const suffix = axisUnitSuffix(axis, units);
                // The domain's own ends, taken through `axisTicks` rather than
                // read off `domain` directly: that is where the fractional-step
                // rounding lives, and without it a ppO₂ row is labelled
                // `1.4000000000000001`.
                const ticks = axisTicks(row.domain);
                const bounds = [ticks[ticks.length - 1], ticks[0]];

                return (
                  <g key={axis} data-deco-panel={axis} aria-hidden>
                    {bounds.map((tick) => (
                      <line
                        key={tick}
                        className="text-border"
                        x1={PADDING.left}
                        x2={WIDTH - PADDING.right}
                        y1={row.y(tick)}
                        y2={row.y(tick)}
                        stroke="currentColor"
                        strokeWidth={1}
                      />
                    ))}
                    {bounds.map((tick, position) => (
                      <text
                        key={tick}
                        x={PADDING.left - 6}
                        y={row.y(tick)}
                        textAnchor="end"
                        dominantBaseline="middle"
                        fontSize={10}
                        fill="currentColor"
                        className="text-muted-foreground"
                      >
                        {position === 0 ? `${tick}${suffix}` : tick}
                      </text>
                    ))}
                  </g>
                );
              })}

              {elapsedTicks(duration).map((tick) => (
                <text
                  key={tick}
                  aria-hidden
                  x={x(tick)}
                  y={height - 8}
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
                  clipPath={
                    channel.panelIndex >= 0
                      ? `url(#${clipPrefix}-panel-${channel.panelIndex})`
                      : undefined
                  }
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
              for why they are a separate list rather than one more channel. */}
              {eventsShown &&
                events.map((event, index) => (
                  <EventMarker
                    key={`${event.time}-${event.type}-${index}`}
                    event={event}
                    cx={x(event.time)}
                    hovered={event === hoveredEvent}
                  />
                ))}

              {/* Through the deco panel as well as the depth plot: it is one
              instant of one dive, and a crosshair that stopped at the depth
              plot's baseline would leave the diver reading a panel dot with no
              line to place it on. */}
              {hoveredSeconds !== null && (
                <line
                  x1={x(hoveredSeconds)}
                  x2={x(hoveredSeconds)}
                  y1={PADDING.top}
                  y2={chartFoot}
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-muted-foreground"
                />
              )}

              {dots.map((readout) => (
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
                height={chartFoot - PADDING.top}
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
                  // The box the card's percentage offsets are resolved against,
                  // which grows with the panel: a card positioned as a fraction
                  // of a height it no longer has lands somewhere else entirely.
                  chartHeight={height}
                  // The topmost of the dots being described, which is only used to
                  // decide which end of the plot the card sits at - see
                  // `tooltipVerticalAnchor`. `PLOT_BOTTOM` is the degenerate
                  // fallback for a card with no dot to hang off - an event on its
                  // own, or readings that are all off their rows' axes - which
                  // puts it at the top, clear of the marker on the baseline.
                  topmostY={
                    dots.length > 0
                      ? Math.min(...dots.map((readout) => readout.cy))
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
  // The reading is outside its row's axis, so the curve carrying it has left the
  // row and there is nowhere on the chart to put a dot for it. The card still
  // names it.
  offScale: boolean;
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

// **Three shapes for thirteen types, and the family is the whole point.** A
// stop is a triangle whether the computer prescribed it or recorded it broken,
// an alarm is the computer talking and draws the general circle, and the gas
// plan is the diamond. Nine more outlines would be nine more things to tell
// apart at four units across; the crosshair says which one it is in words.
const EVENT_GLYPHS: Record<DiveProfileEventType, EventGlyph> = {
  gas_switch: { colorClass: "text-pressure", shape: "diamond" },
  deep_stop: { colorClass: "text-muted-foreground", shape: "triangle" },
  safety_stop: { colorClass: "text-muted-foreground", shape: "triangle" },
  bookmark: { colorClass: "text-muted-foreground", shape: "circle" },
  // The alarm classes. A violated stop keeps the stop's triangle rather than
  // taking the ceiling's red: red means the ceiling on this chart and only the
  // ceiling, and a safety stop is precisely the stop that is not an obligation.
  safety_stop_mandatory: {
    colorClass: "text-muted-foreground",
    shape: "triangle",
  },
  safety_stop_violation: {
    colorClass: "text-muted-foreground",
    shape: "triangle",
  },
  deep_stop_violation: {
    colorClass: "text-muted-foreground",
    shape: "triangle",
  },
  ascent_rate: { colorClass: "text-muted-foreground", shape: "circle" },
  ceiling_violation: { colorClass: "text-muted-foreground", shape: "circle" },
  ndl_reached: { colorClass: "text-muted-foreground", shape: "circle" },
  ppo2_high: { colorClass: "text-muted-foreground", shape: "circle" },
  pressure_low: { colorClass: "text-muted-foreground", shape: "circle" },
  depth_alarm: { colorClass: "text-muted-foreground", shape: "circle" },
};

// What a marker with no type, or a type this build has never heard of, is drawn
// as.
//
// Both are real and they are not the same thing. An **absent** type is the
// format's own way of saying the device recorded something this vocabulary has
// no word for, and arrives with the device's wording in `label`. An
// **unrecognized** type is the deployment gap: `event.type` is a `string` on the
// wire that TypeScript has been told is one of thirteen, the two repos deploy
// independently, and an API that grows a fourteenth reaches browsers still
// running this bundle. Indexing `EVENT_GLYPHS` with either yields `undefined`,
// and destructuring that is a `TypeError` inside render - which, with no
// `error.tsx` anywhere under `src/app`, takes out the whole dive detail route
// rather than one tick. A neutral grey circle is the honest degradation for
// both, and `describeEvent` falls back to the device's own wording beside it.
const UNKNOWN_EVENT_GLYPH: EventGlyph = {
  colorClass: "text-muted-foreground",
  shape: "circle",
};

function glyphFor(type: string | null | undefined): EventGlyph {
  if (type == null) return UNKNOWN_EVENT_GLYPH;

  // The `as` is doing the opposite of its usual job here: it exists so the `??`
  // is reachable, not to silence it.
  return EVENT_GLYPHS[type as DiveProfileEventType] ?? UNKNOWN_EVENT_GLYPH;
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
  chartHeight,
  topmostY,
}: {
  seconds: number;
  readouts: Readout[];
  event: DiveProfileEvent | null;
  cx: number;
  chartHeight: number;
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
        top: `${(y / chartHeight) * 100}%`,
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
              // for every type in the vocabulary has no business claiming to be
              // one of them. The circle is already what the general types draw,
              // and the crosshair names the particular one in words.
              //
              // Deliberately uncoloured in both states, unlike every swatch
              // above. Marker colour answers "does this join to something else
              // on the chart" - only a gas switch does, in the cylinders' violet
              // - so a coloured legend swatch would be making that claim on
              // behalf of every other type, for which it is false.
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
  readings,
  events,
  duration,
  units,
}: {
  // A channel's readings that are on screen, in display units - not its raw
  // series. Every one of these comes through `drawnValues`, because this
  // function's whole output is extremes and an extreme taken over samples the
  // chart declined to draw describes a curve nobody can see. An empty array is
  // "this channel is not on screen", which covers hidden, absent and too-sparse
  // with one check.
  readings: (key: ProfileChannelKey) => number[];
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
  const word = (key: ProfileChannelKey) => channelWord(key, units);

  // **Which extreme says something is per quantity**, and the NDL is the one
  // that reads against the grain. A maximum NDL is the device's display cap on
  // almost every recreational dive and says nothing, while the minimum is the
  // moment the dive came closest to an obligation - the same call the API makes
  // in choosing which extreme to store. Every other single-extreme channel -
  // depth, the ceiling, time to surface, ppO₂ and the three percentages - names
  // its maximum, and temperature and tank pressure are the two ranges, because
  // there both ends are a fact about the dive.
  //
  // Driven by `PROFILE_CHANNEL_KEYS` rather than by ten `if`s, so the sentence
  // keeps the legend's order and a channel added to that list cannot be silently
  // left out of what a screen reader hears.
  const phrase = (key: ProfileChannelKey, values: number[]): string | null => {
    if (values.length === 0) return null;
    const low = say(key, Math.min(...values));
    const high = say(key, Math.max(...values));

    switch (key) {
      case "depth":
        return `maximum depth ${high} ${word(key)}`;
      case "ceiling":
        // The deepest ceiling, which is the one number that says how much
        // decompression this dive owed at its worst.
        return `deco ceiling to ${high} ${word(key)}`;
      case "temperature":
        return `temperature ${low} to ${high} ${word(key)}`;
      case "pressure":
        return `tank pressure ${high} down to ${low} ${word(key)}`;
      case "ndl":
        return `no-decompression time down to ${low} ${word(key)}`;
      case "tts":
        return `time to surface up to ${high} ${word(key)}`;
      case "ppo2":
        return `oxygen partial pressure up to ${high} ${word(key)}`;
      case "cns":
        return `CNS to ${high} ${word(key)}`;
      case "gradient_factor":
        return `gradient factor to ${high} ${word(key)}`;
      case "surface_gradient_factor":
        return `surface gradient factor to ${high} ${word(key)}`;
    }
  };

  for (const key of PROFILE_CHANNEL_KEYS) {
    const said = phrase(key, readings(key));
    if (said) parts.push(said);
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
      .sort((first, second) => first.time - second.time)
      .slice(0, MAX_DESCRIBED_EVENTS)
      .map(
        (event) =>
          `${describeEvent(event)} at ${formatDurationHoursMinutes(event.time)}`,
      );
    if (events.length > named.length) {
      named.push(`and ${events.length - named.length} more`);
    }
    parts.push(`markers: ${named.join(", ")}`);
  }

  return `${parts.join(", ")}.`;
}
