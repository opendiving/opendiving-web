"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DiveGasUsePoint } from "@/lib/api/dive-stats";
import {
  type GasUseMark,
  GAS_USE_MARKS,
  TREND_GAP_DAYS,
  bandRanges,
  rollingMean,
  rollingStdDev,
  scopeRange,
  segmentByGap,
  trendWindow,
} from "@/lib/dive-gas";
import type { ChartScope } from "@/lib/chart-period";
import { axisTicks, niceDomain } from "@/lib/chart-scale";
import { smoothBandPath, smoothPath } from "@/lib/chart-path";
import {
  GAS_USE_SERIES_KEY,
  parseSeriesVisibility,
  readStoredSeries,
  subscribeToNothing,
  toggleSeries,
  writeSeriesVisibility,
} from "@/lib/chart-series-view";
import { diveWallClockTime, formatDiveDateTime } from "@/lib/date-time";
import { cn } from "@/lib/utils";

// Hand-rolled SVG rather than a charting library, for two reasons. The app ships
// a strict nonce-based CSP (`src/proxy.ts`): inline style *attributes* are
// allowed, but a library that injects a `<style>` element - which the
// emotion/styled-components-based ones do - would work in dev and break in
// production, which is a miserable bug to acquire for one chart. And this is the
// same call already made for `VolumeCombobox` and the drag-to-reorder list.
//
// Two colors, doing two different jobs. The trend is `--coral` (the primary
// brand accent, so the line you're meant to read is the one that stands out) and
// the per-dive dots are `--teal`, which sits across the color wheel from it -
// otherwise the dots and the line they're averaged into are the same mark in the
// same color, and the eye can't separate the raw data from the smoothing.
//
// Both rather than `--primary`: coral and teal are deliberately declared once
// and never redeclared under `.dark` (see `globals.css`), so they hold their
// contrast in both themes, whereas `--primary` is near-black in light mode and a
// mid grey in dark - which left the trend line barely visible on a dark card.

// The viewBox coordinate space. Not pixels: the SVG scales to its container, so
// these are only ever ratios to each other.
const WIDTH = 720;
const HEIGHT = 240;
const PADDING = { top: 12, right: 14, bottom: 28, left: 42 };

const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

// How many year labels the "all" scope's axis will carry before it starts
// skipping them. Twelve four-digit labels across a 720-unit viewBox leaves room
// either side of each; twenty-five would collide.
const MAX_YEAR_LABELS = 12;

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface GasUseChartProps {
  // The *whole* series, oldest first, as the API returns it - not just the
  // visible window. The scale, the domain and the trend are all derived from all
  // of it (see below); only the marks are windowed.
  points: DiveGasUsePoint[];
  scope: ChartScope;
  // A timestamp inside the period to show. Always one of the points' own times,
  // so switching scope keeps you near the same dive. Ignored when scope is
  // "all".
  anchor: number;
}

// Module-level so the reference is stable across renders - see
// `subscribeToNothing`. `useSyncExternalStore` re-reads whenever this identity
// changes, which an inline arrow would make every render.
const readStoredMarks = () => readStoredSeries(GAS_USE_SERIES_KEY);

export function GasUseChart({ points, scope, anchor }: GasUseChartProps) {
  // Index into `points` of the dive under the cursor (or keyboard focus). One
  // piece of state for the whole chart, not a tooltip component per dot: at a
  // few hundred dives, per-dot tooltip instances are a lot of machinery for one
  // that can ever be open. It also drives the dot's own highlight, so the lit
  // dot and the tooltip can't disagree the way a CSS `:hover` and React state
  // would.
  const [hovered, setHovered] = useState<number | null>(null);

  // Which marks the diver picked in *this* visit, and null until they pick -
  // which is what leaves room for the remembered selection underneath. Exactly
  // the shape the card uses for its remembered period, one level up.
  const [chosen, setChosen] = useState<GasUseMark[] | null>(null);

  // Read through `useSyncExternalStore` for the reason spelled out on
  // `GasUseCard`'s own remembered view: `localStorage` doesn't exist on the
  // server, so a first client render that read it directly would disagree with
  // the HTML Next rendered and be a hydration mismatch.
  const storedMarks = useSyncExternalStore(
    subscribeToNothing,
    readStoredMarks,
    () => null,
  );
  const remembered = useMemo(
    () => parseSeriesVisibility(storedMarks, GAS_USE_MARKS),
    [storedMarks],
  );

  // Remembered for next time, in an effect rather than in the click handler
  // below, which is what keeps that handler's updater pure - React is entitled
  // to call an updater twice.
  useEffect(() => {
    if (chosen) writeSeriesVisibility(GAS_USE_SERIES_KEY, chosen);
  }, [chosen]);

  // `marks`, not `visible` - that name is taken further down by the dives inside
  // the window, which is a different sense of the same word.
  const marks: readonly GasUseMark[] = chosen ?? remembered ?? GAS_USE_MARKS;

  // The updater form, not `toggleSeries(marks, ...)`. `marks` is this render's
  // value, and two toggles clicked inside one batch would both compute from it -
  // so the second would silently undo the first.
  const toggle = (mark: GasUseMark) =>
    setChosen((current) => toggleSeries(current ?? marks, mark, GAS_USE_MARKS));

  // Two points is the minimum for a horizontal axis at all: with one, every
  // timestamp maps to the same x and the scale divides by zero.
  if (points.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Log at least two dives with an average depth and tank pressures to see
        your gas consumption trend.
      </p>
    );
  }

  // A dive's own wall-clock time, never the viewer's - the same convention as
  // every other dive timestamp in the app. Read back with `getUTC*` only.
  const times = points.map((point) => diveWallClockTime(point.start_time));
  const rmvs = points.map((point) => point.gas_use.rmv);

  // Both derived from the *whole* series, deliberately, and then windowed. The y
  // axis staying put while you page through years is what makes the periods
  // comparable at a glance - a per-window domain would rescale on every click
  // and make a good year look identical to a bad one. Likewise the trailing mean
  // is computed across the whole history, so the first dive of a year carries
  // the context of the last few dives of the one before instead of restarting.
  const domain = niceDomain(rmvs);

  // Smoothed at the resolution the scope is asking about - see `trendWindow`.
  // Deliberately from the whole series' length, not the visible window's: the
  // trend itself is computed across all of it (below), so how much room the
  // rolling mean has to move is a property of the history, not of the year you
  // happen to be looking at.
  // Not `window` - that shadows the DOM global, which is a trap to leave lying
  // around in a component that could one day want to measure something.
  const windowSize = trendWindow(scope, points.length);
  const trend = rollingMean(rmvs, windowSize);
  const spread = rollingStdDev(rmvs, windowSize);

  // The career average, drawn as a reference line. It's what makes a period
  // readable on its own terms: the stat row above the chart says this year
  // averaged 16.4, and this line says whether that is good *for this diver*
  // without them having to page back through the previous years to find out.
  // Deliberately the whole series and not the visible window - a line at the
  // mean of what you're already looking at tells you nothing you can't see.
  const allTimeMean = rmvs.reduce((sum, rmv) => sum + rmv, 0) / rmvs.length;

  const range = scopeRange(times, anchor, scope);

  // Fixed calendar bounds, not the min/max of what's visible: a year in which
  // you only dived in April should show one cluster on the left, not April
  // stretched across the full width as though it were the whole year.
  const x = (time: number) =>
    PADDING.left +
    ((time - range.start) / (range.end - range.start || 1)) * PLOT_WIDTH;
  const y = (rmv: number) =>
    PADDING.top +
    (1 - (rmv - domain.min) / (domain.max - domain.min)) * PLOT_HEIGHT;

  const visible = points
    .map((point, index) => ({ point, index }))
    .filter(
      ({ index }) => times[index] >= range.start && times[index] < range.end,
    );

  // The trend and its spread band never leave the plot, whatever the arithmetic
  // says. `niceDomain` covers the raw dives, and a window's mean plus a standard
  // deviation can sit just outside that - which would draw the band over the
  // axis labels rather than reporting anything.
  const clamp = (rmv: number) =>
    Math.min(domain.max, Math.max(domain.min, rmv));

  const showTrend = marks.includes("trend");

  // The spread band is drawn at the scopes where a trip has horizontal room to
  // be a ribbon, and not across a whole career, where it hasn't. A fortnight of
  // diving is about four units wide out of 664 at "all", so the band collapses
  // into a vertical smear - and one that says nothing the dots stacked inside it
  // don't already say more precisely.
  //
  // Two values, not one: the band is part of what the trend toggle turns on, so
  // the legend has to keep describing it while the trend is off - otherwise the
  // control loses the word "spread" exactly when you're deciding whether to
  // bring it back.
  const spreadInScope = scope !== "all";
  const showSpread = showTrend && spreadInScope;

  // One curve per stretch of diving, not one across the window - see
  // `segmentByGap`. A stretch containing a single dive yields a bare `M`, which
  // draws nothing, and no band at all; that dive's dot still renders below.
  const trendSegments = segmentByGap(
    visible.map(({ index }) => times[index]),
    TREND_GAP_DAYS,
  ).map((positions) => {
    const at = positions.map((position) => visible[position].index);
    const points = at.map((index) => ({
      x: x(times[index]),
      y: y(trend[index]),
    }));
    const upper = at.map((index) => ({
      x: x(times[index]),
      y: y(clamp(trend[index] + spread[index])),
    }));
    const lower = at.map((index) => ({
      x: x(times[index]),
      y: y(clamp(trend[index] - spread[index])),
    }));

    return {
      line: smoothPath(points),
      band: showSpread ? smoothBandPath(upper, lower) : "",
    };
  });

  const xTicks = buildXTicks(scope, range);
  const bands = bandRanges(scope, range);

  // Cleared when the window changes out from under a hovered dot - paging from
  // 2025 to 2026 with the cursor still over the chart would otherwise leave a
  // tooltip describing a dive that's no longer drawn.
  const hoveredIndex =
    hovered !== null && visible.some(({ index }) => index === hovered)
      ? hovered
      : -1;
  const hoveredPoint = hoveredIndex >= 0 ? points[hoveredIndex] : null;

  if (marks.length === 0) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">
          Everything is hidden. Pick a series below to plot it.
        </p>
        <GasUseLegend
          marks={marks}
          windowSize={windowSize}
          withSpread={spreadInScope}
          onToggle={toggle}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Wide content scrolls in its own container rather than shrinking the
          whole chart to phone width, where the axis labels would become
          unreadable - same treatment the gas mixtures table gets on the dive
          detail page. The legend deliberately sits *outside* it: it's text, so
          it should wrap to the screen rather than scroll sideways with the plot,
          and on a phone the container's own horizontal scrollbar is drawn across
          the bottom of whatever it contains - straight through the legend. */}
      <div className="overflow-x-auto">
        {/* Sized to exactly the chart, and the positioning context the
            tooltip's percentage offsets are resolved against. */}
        <div className="relative min-w-[560px]">
          {/* `group`, not `img`. Every dot here is a link to its dive, and
              `img` declares that the whole plot is one picture. The links do
              survive it - WAI-ARIA exempts focusable descendants from
              presentational inheritance, and Chrome's tree shows them - but a
              screen reader browsing the page is still being told there is
              nothing inside worth browsing. `group` keeps the summary as the
              container's name and leaves the dives reachable both by tabbing
              and by browsing. The dive profile chart keeps `img`, correctly:
              it is a picture, with nothing interactive inside it. */}
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full h-auto"
            role="group"
            aria-label={describeSeries(visible.length, allTimeMean)}
          >
            {/* Alternating months (or years) behind the plot - the chart's
                only vertical structure, and what lets a cluster of dots be
                placed in the year without tracing down to the axis. First, so
                everything else draws over it. */}
            {bands.map((band) => (
              <rect
                key={band.start}
                x={x(band.start)}
                y={PADDING.top}
                width={x(band.end) - x(band.start)}
                height={PLOT_HEIGHT}
                fill="currentColor"
                className="text-muted"
              />
            ))}

            {/* Gridlines and the y scale. `currentColor` throughout, so
                light/dark mode is inherited from the surrounding text colors
                rather than hardcoded per theme. Dashed, and only these: with a
                month band, a spread band, a reference line and a trend all
                sharing the plot, solid rules across it competed with the data
                instead of supporting it. */}
            {axisTicks(domain).map((tick) => (
              // `aria-hidden`, here and on the x labels below: the axis is a
              // reading aid for the eye, and a screen reader walking the group
              // should reach the dives, not twelve unlabelled numbers and the
              // months they sit under first. The summary on the group and each
              // dot's own label carry everything these say.
              <g key={tick} aria-hidden className="text-border">
                <line
                  x1={PADDING.left}
                  x2={WIDTH - PADDING.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="currentColor"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                />
                <text
                  x={PADDING.left - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="currentColor"
                  className="text-muted-foreground"
                >
                  {tick}
                </text>
              </g>
            ))}

            {/* The one solid rule, closing the plot along the bottom. It sits
                on the lowest gridline, which is the axis - dashed, it read as
                another gridline and the plot had no floor. */}
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={PADDING.top + PLOT_HEIGHT}
              y2={PADDING.top + PLOT_HEIGHT}
              stroke="currentColor"
              strokeWidth={1}
              className="text-border"
            />

            {xTicks.map(({ label, time }) => (
              <text
                key={label}
                aria-hidden
                x={x(time)}
                y={HEIGHT - 8}
                textAnchor="middle"
                fontSize={11}
                fill="currentColor"
                className="text-muted-foreground"
              >
                {label}
              </text>
            ))}

            {/* The career average. A longer dash than the gridlines and a
                darker token, so it reads as a statement about the data rather
                than as part of the scale. */}
            {marks.includes("average") && (
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={y(allTimeMean)}
                y2={y(allTimeMean)}
                stroke="currentColor"
                strokeWidth={1.5}
                strokeDasharray="7 5"
                className="text-muted-foreground opacity-70"
              />
            )}

            {/* The spread band, then the trend, then the dots on top - back to
                front. The band is what a bare line was missing: it gives
                the trend body, and it says how tightly the dives it averages
                were clustered, which is most of what improving actually looks
                like. */}
            {trendSegments
              .filter((segment) => segment.band)
              .map((segment, index) => (
                <path
                  key={index}
                  d={segment.band}
                  fill="currentColor"
                  stroke="none"
                  className="text-coral opacity-15"
                />
              ))}

            {showTrend &&
              trendSegments.map((segment, index) => (
                <path
                  key={index}
                  d={segment.line}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  className="text-coral"
                />
              ))}

            {marks.includes("dives") &&
              visible.map(({ point, index }) => (
                // A plain SVG `<a>`, not `next/link`: this is inside the SVG
                // namespace, and an anchor here still gets focus, middle-click and
                // open-in-new-tab for free. `aria-label` carries what the `<title>`
                // element used to - the tooltip below is a visual affordance and says
                // nothing to a screen reader.
                <a
                  key={point.dive_uuid}
                  href={`/dives/${point.dive_uuid}`}
                  aria-label={describePoint(point)}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  // Keyboard focus opens the tooltip too, so tabbing through the
                  // series reads the same as hovering it.
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                >
                  {/* Faded by default so overlapping dots read as density rather than
                a solid band, and lit up when it's the one being described. */}
                  <circle
                    cx={x(times[index])}
                    cy={y(point.gas_use.rmv)}
                    r={hovered === index ? 5 : scope === "all" ? 2.5 : 3.5}
                    fill="currentColor"
                    className={cn(
                      "text-teal transition-all",
                      hovered === index ? "opacity-100" : "opacity-45",
                    )}
                  />
                  {/* An invisible, larger hit target. A 2.5-unit dot is a ~4px target
                on screen, which is a fiddly thing to hover deliberately.
                `transparent` rather than `none` - `fill="none"` takes no
                pointer events at all, which is the opposite of the point. */}
                  <circle
                    cx={x(times[index])}
                    cy={y(point.gas_use.rmv)}
                    r={7}
                    fill="transparent"
                  />
                </a>
              ))}
          </svg>

          {hoveredPoint && (
            <GasUseTooltip
              point={hoveredPoint}
              cx={x(times[hoveredIndex])}
              cy={y(hoveredPoint.gas_use.rmv)}
            />
          )}
        </div>
      </div>

      <GasUseLegend
        marks={marks}
        windowSize={windowSize}
        withSpread={spreadInScope}
        onToggle={toggle}
      />
    </div>
  );
}

// Three marks share this plot and none of them are self-evident, so identity is
// never left to color alone - the same call, and the same shape, as the dive
// profile chart's toggles. It also carries the y axis's unit, which the bare
// numbers up the side don't.
//
// And, like that one, the legend *is* the control for what's plotted: it already
// names every mark and carries its swatch, so it's where you look to ask "which
// one is that" - and "hide it" is the next thought. A separate row of checkboxes
// would say the same three words twice.
function GasUseLegend({
  marks,
  windowSize,
  withSpread,
  onToggle,
}: {
  marks: readonly GasUseMark[];
  windowSize: number;
  // Whether the spread band is part of the trend *at this scope* - not whether
  // it's currently drawn. The legend describes what the toggle turns on, so it
  // has to keep saying "and spread" while the trend is off.
  withSpread: boolean;
  onToggle: (mark: GasUseMark) => void;
}) {
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
      role="group"
      aria-label="Plotted series"
    >
      <MarkToggle mark="dives" marks={marks} onToggle={onToggle}>
        <span
          aria-hidden
          className={cn(
            "inline-block h-2 w-2 rounded-full bg-current opacity-70",
            marks.includes("dives") && "text-teal",
          )}
        />
        Dive (L/min)
      </MarkToggle>
      <MarkToggle mark="trend" marks={marks} onToggle={onToggle}>
        {/* The trend and its band are one mark, so they get one swatch - and one
            toggle: a line through the middle of the shading it sits in. */}
        <span aria-hidden className="relative inline-block h-2.5 w-4">
          {withSpread && (
            <span
              className={cn(
                "absolute inset-0 rounded-sm bg-current opacity-15",
                marks.includes("trend") && "text-coral",
              )}
            />
          )}
          <span
            className={cn(
              "absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-current",
              marks.includes("trend") && "text-coral",
            )}
          />
        </span>
        {windowSize}-dive trend
        {withSpread && " and spread"}
      </MarkToggle>
      <MarkToggle mark="average" marks={marks} onToggle={onToggle}>
        <span
          aria-hidden
          className="inline-block h-0 w-4 border-t border-dashed border-current opacity-70"
        />
        All-time average
      </MarkToggle>
    </div>
  );
}

// One legend entry, as a button.
//
// `aria-pressed` rather than a checkbox: these change the picture in place, and
// the pressed state is what a screen reader needs to hear. The label stays the
// mark's own name in both states - "Show all-time average" on a control that is
// currently showing it describes what the button does rather than what it is,
// and `aria-pressed` already carries the rest.
//
// A hidden mark keeps its swatch, drawn in the button's own muted color rather
// than the mark's: a grey line where the coral one was is the whole of "this is
// off, and this is what it would be".
function MarkToggle({
  mark,
  marks,
  onToggle,
  children,
}: {
  mark: GasUseMark;
  marks: readonly GasUseMark[];
  onToggle: (mark: GasUseMark) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={marks.includes(mark)}
      onClick={() => onToggle(mark)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        marks.includes(mark)
          ? "text-muted-foreground"
          : "text-muted-foreground/50",
      )}
    >
      {children}
    </button>
  );
}

// The chart's accessible name. The dots carry their own labels and the visual
// tooltip says nothing to a screen reader, so this only has to frame them: how
// many dives are plotted, and the one figure the whole chart is read against.
function describeSeries(dives: number, allTimeMean: number): string {
  return `Gas consumption over ${dives} dives, against an all-time average of ${allTimeMean.toFixed(1)} liters per minute.`;
}

// The hover card itself: HTML rather than SVG `<text>`, so it gets the app's
// popover tokens, a border, a shadow and crisp text at any chart width - none of
// which are worth hand-drawing in SVG.
//
// Positioned in percentages of the chart box, which works because the SVG scales
// uniformly inside a wrapper of exactly its size, so viewBox units map straight
// onto percentages without measuring anything in the DOM. The `style` prop is an
// inline style *attribute*, which the CSP allows (`style-src-attr
// 'unsafe-inline'`); an injected `<style>` element would not be.
function GasUseTooltip({
  point,
  cx,
  cy,
}: {
  point: DiveGasUsePoint;
  cx: number;
  cy: number;
}) {
  // Flipped and nudged so the card always lands inside the chart box. It has to:
  // the scroll container around it clips (setting `overflow-x` to `auto` makes
  // `overflow-y` compute to `auto` as well), so anything hanging past the top
  // edge would be cut off or add a stray scrollbar.
  const below = cy < HEIGHT * 0.35;
  const translateY = below ? "12px" : "calc(-100% - 12px)";
  const translateX =
    cx < WIDTH * 0.18
      ? "-12px"
      : cx > WIDTH * 0.82
        ? "calc(-100% + 12px)"
        : "-50%";

  return (
    <div
      // Never a hover target itself - it sits over the dots, and letting it take
      // the pointer would make it flicker as it steals its own trigger's hover.
      // `bg-tooltip`, not `bg-popover`: popover is the *same* color as the card
      // it would be floating on in both themes, leaving a 1px border to do all
      // the separating. Over a chart, where the card overlaps its own data
      // points, that isn't enough. The border is a light hairline rather than
      // `--border` for the same reason - on a near-black chip the theme's border
      // color disappears in light mode and merges with it in dark.
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-white/10 bg-tooltip px-3 py-2 text-tooltip-foreground shadow-lg"
      style={{
        left: `${(cx / WIDTH) * 100}%`,
        top: `${(cy / HEIGHT) * 100}%`,
        transform: `translate(${translateX}, ${translateY})`,
      }}
      role="presentation"
    >
      <div className="text-sm font-semibold">
        {point.gas_use.rmv} <span className="font-normal">L/min</span>
      </div>
      <div className="mt-0.5 text-xs text-tooltip-foreground/70">
        Dive #{point.dive_number} &middot;{" "}
        {formatDiveDateTime(point.start_time, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </div>
      <div className="text-xs text-tooltip-foreground/70">
        {describePointBasis(point)}
      </div>
    </div>
  );
}

// What the RMV above it was worked out from, which is not the same sentence for
// every dot on this chart.
//
// A single-cylinder point is the dive's own average depth over its whole
// duration, and saying so is what makes the figure checkable. **A multi-tank
// point is not**: each cylinder is normalized against its own mean depth over
// the stretch it was breathed for - that is the entire point of the split, see
// `DiveTankGasUse` - so pairing this rate with `avg_depth` would name a
// denominator it was never divided by. On dive #493 that reads as "12.4 L/min at
// 20.87m" for a figure derived at 33.99 m.
//
// Its litres are understated in the same way, being the sum over attributed
// tanks only, so the two are dropped together rather than one of them being
// quietly wrong beside the other. What replaces them is the one thing a diver
// needs to read the dot correctly: this rate is per cylinder, and the detail
// page is where the cylinders are.
function describePointBasis(point: DiveGasUsePoint): string {
  const tanks = point.gas_use.tanks?.length ?? 0;
  if (isPerTankPoint(point)) {
    return `Per tank across ${tanks} ${tanks === 1 ? "cylinder" : "cylinders"} - see the dive for the split`;
  }

  return `${point.avg_depth}m average · ${point.gas_use.gas_used} L used`;
}

// Whether this dot's RMV was derived per cylinder rather than against the dive's
// own average depth.
//
// One dot, two sentences about it - the tooltip and the accessible name - and
// they have to agree, so they ask one function rather than each testing `tanks`
// for themselves. Written out twice, the pair could drift into a chart whose
// visible label and announced label make different claims about the same
// figure, which is worse than either being wrong on its own.
function isPerTankPoint(point: DiveGasUsePoint): boolean {
  return (point.gas_use.tanks?.length ?? 0) > 0;
}

// The accessible name of a dot's link - what the `<title>` element used to say,
// now that the visual tooltip is `aria-hidden` decoration.
function describePoint(point: DiveGasUsePoint): string {
  const date = formatDiveDateTime(point.start_time, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Same predicate as `describePointBasis`, and it has to be: this is the only
  // version of the sentence a screen-reader user gets, so it cannot be the one
  // that names a depth the rate didn't come from.
  const basis = isPerTankPoint(point)
    ? "derived per cylinder"
    : `at ${point.avg_depth}m average`;

  return `Dive #${point.dive_number}, ${date} - ${point.gas_use.rmv} liters per minute ${basis}`;
}

// Axis labels at whatever granularity the window makes readable: years across a
// whole career, months within a year, week starts within a month. All built with
// `Date.UTC`/`getUTC*`, since the times these sit alongside are wall-clock
// instants (see `diveWallClockTime`).
function buildXTicks(
  scope: ChartScope,
  range: { start: number; end: number },
): { label: string; time: number }[] {
  if (scope === "month") {
    const year = new Date(range.start).getUTCFullYear();
    const month = new Date(range.start).getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    return [1, 8, 15, 22, 29]
      .filter((day) => day <= daysInMonth)
      .map((day) => ({ label: String(day), time: Date.UTC(year, month, day) }));
  }

  if (scope === "year") {
    const year = new Date(range.start).getUTCFullYear();
    // Centred in the month rather than pinned to its first day, so each label
    // sits under the band it names instead of on the seam between two.
    return MONTH_LABELS.map((label, month) => ({
      label,
      time: (Date.UTC(year, month, 1) + Date.UTC(year, month + 1, 1)) / 2,
    }));
  }

  // Whole series: one label per calendar year it spans, centred in the part of
  // that year the chart actually plots. Centring is what lets the first and last
  // labels survive - a career starts partway through its first year, so a label
  // pinned to that January 1st falls outside the range and used to be dropped.
  const firstYear = new Date(range.start).getUTCFullYear();
  const lastYear = new Date(range.end).getUTCFullYear();
  const years = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, index) => firstYear + index,
  );

  // A long enough career runs the labels into each other, so thin them evenly
  // rather than letting them overlap.
  const stride = Math.ceil(years.length / MAX_YEAR_LABELS);

  return years
    .filter((_, index) => index % stride === 0)
    .map((year) => ({
      label: String(year),
      time:
        (Math.max(Date.UTC(year, 0, 1), range.start) +
          Math.min(Date.UTC(year + 1, 0, 1), range.end)) /
        2,
    }));
}
