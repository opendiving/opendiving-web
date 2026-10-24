"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ChartHoverCard } from "@/components/charts/chart-hover-card";
import { ChartYAxis } from "@/components/charts/chart-y-axis";
import type { DiveGasUsePoint } from "@/lib/api/dive-stats";
import {
  type BinUnit,
  type GasUseMark,
  GAS_USE_MARKS,
  TREND_GAP_MS,
  bandRanges,
  binSummaries,
  binUnit,
  clipOutliers,
  quantile,
  quartiles,
  scopeRange,
} from "@/lib/dive-gas";
import { type ChartScope, monthName } from "@/lib/chart-period";
import {
  CHART_HEIGHT,
  CHART_PADDING,
  CHART_PLOT_HEIGHT,
  CHART_WIDTH,
  axisTicks,
  labelCapacity,
  niceDomain,
  plotLeft,
} from "@/lib/chart-scale";
import {
  type PlotMark,
  nearestByX,
  nearestWithin,
  viewBoxPoint,
} from "@/lib/chart-readout";
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
import { useChartReadout } from "@/hooks/useChartReadout";
import { useChartWidth } from "@/hooks/useChartWidth";
import { useUnits } from "@/hooks/useUnits";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import {
  displayNumber,
  formatDepth,
  formatGasVolume,
  toDisplayUnits,
  unitLabel,
  unitWord,
  type UnitSystem,
} from "@/lib/units";

// Hand-rolled SVG rather than a charting library, for two reasons. The app ships
// a strict nonce-based CSP (`src/proxy.ts`): inline style *attributes* are
// allowed, but a library that injects a `<style>` element - which the
// emotion/styled-components-based ones do - would work in dev and break in
// production, which is a miserable bug to acquire for one chart. And this is the
// same call already made for `VolumeCombobox` and the drag-to-reorder list.
//
// Two colors, doing two different jobs. The bins are `--coral` (the primary
// brand accent, so the mark you're meant to read is the one that stands out) and
// the per-dive dots are `--teal`, which sits across the color wheel from it -
// otherwise the dots and the boxes summarizing them are the same mark in the
// same color, and the eye can't separate the evidence from the reading.
//
// Both rather than `--primary`: coral and teal are deliberately declared once
// and never redeclared under `.dark` (see `globals.css`), so they hold their
// contrast in both themes, whereas `--primary` is near-black in light mode and a
// mid grey in dark, which is barely visible against a dark card.

// How far from a dot a tap still means it, in CSS px - about half a fingertip.
const TAP_REACH = 24;

// The room each x label gets before the axis starts skipping them, in viewBox
// units. A year's label sits at the centre of the part of that year the chart
// plots, so a career starting in December crowds its first two; they get about
// twice a 27-unit year's width, which is twelve across the design width. Months
// are one per evenly spaced slot and need only a 22-unit "May" plus air, which
// the design width always has.
const YEAR_LABEL_SPACING = 55;
const MONTH_LABEL_SPACING = 26;

// The gap either side of a bin's box, in viewBox units, so neighbouring bins
// read as two boxes rather than one long one.
const BIN_INSET = 1;

// Fewer dives than this and a bin has no middle half worth drawing - the
// quartiles of two dives are the two dives - so it gets its median tick alone.
const BIN_BOX_MIN_DIVES = 3;

// What the legend calls a bin's summary, per unit.
const BIN_LABELS: Record<BinUnit, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  quarter: "Quarterly",
  year: "Yearly",
};

const MONTH_LABELS = Array.from({ length: 12 }, (_, month) =>
  monthName(month + 1, "short"),
);

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
  const units = useUnits();
  const withReturnTo = useWithReturnTo();
  const [chartRef, width] = useChartWidth(CHART_WIDTH);
  // Index into `points` of the dive under the cursor, keyboard focus or finger.
  // One piece of state for the whole chart, not a tooltip component per dot: at
  // a few hundred dives, per-dot tooltip instances are a lot of machinery for
  // one that can ever be open. It also drives the dot's own highlight, so the lit
  // dot and the tooltip can't disagree the way a CSS `:hover` and React state
  // would.
  //
  // A finger picks among the dots as drawn, read off their `data-*`: the dot it
  // tapped, or the nearest within reach of the tap, and while scrubbing the one
  // nearest its x.
  const readout = useChartReadout<number>((event, gesture) => {
    const svg = event.currentTarget;
    const at = viewBoxPoint(
      svg.getBoundingClientRect(),
      width,
      event.clientX,
      event.clientY,
    );
    const dots = [...svg.querySelectorAll<SVGElement>("[data-point]")];
    const marks: PlotMark<number>[] = dots.map((dot) => ({
      value: Number(dot.dataset.point),
      x: Number(dot.dataset.x),
      y: Number(dot.dataset.y),
    }));
    if (gesture === "scrub") return nearestByX(marks, at)?.value ?? null;
    const tapped = (event.target as Element).closest?.("[data-point]");
    if (tapped instanceof SVGElement) return Number(tapped.dataset.point);
    return nearestWithin(marks, at, TAP_REACH * at.scale)?.value ?? null;
  });
  const hovered = readout.value;

  // Which marks the diver picked in *this* visit, and null until they pick -
  // which is what leaves room for the remembered selection underneath. Exactly
  // the shape the card uses for its remembered period, one level up.
  const [chosen, setChosen] = useState<GasUseMark[] | null>(null);

  // Read through `useSyncExternalStore` for the reason spelled out on
  // `useChartPeriodView`'s remembered period: `localStorage` doesn't exist on the
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
  // Converted once, here, and everything below - the domain, the axis ticks, the
  // bins, the baseline - is then in the diver's own units, so `niceDomain` picks
  // round cuft/min rather than round L/min rescaled.
  const displayRmv = (rmv: number) => toDisplayUnits(rmv, "rmv", units);
  const rmvs = points.map((point) => displayRmv(point.gas_use.rmv));

  // Derived from the *whole* series, deliberately, and then windowed. The y axis
  // staying put while you page through years is what makes the periods
  // comparable at a glance - a per-window domain would rescale on every click
  // and make a good year look identical to a bad one.
  //
  // Scaled to the series with its outliers left off (`clipOutliers`); a dive
  // outside the axis is pinned to its edge and drawn hollow, see below.
  const domain = niceDomain(clipOutliers(rmvs));
  const ticks = axisTicks(domain);
  const left = plotLeft(ticks);
  const plotWidth = width - left;

  // The career baseline: the all-time median as a reference line, inside a band
  // covering the middle half of every dive. It's what makes a period readable on
  // its own terms: the stat row above the chart says this year averaged 16.4,
  // and the band says whether that is normal *for this diver* without them
  // having to page back through the previous years to find out. Deliberately
  // the whole series and not the visible window - a band around what you're
  // already looking at tells you nothing you can't see. The median rather than
  // the mean, and quartiles rather than a standard deviation, so one misread
  // gauge in a career doesn't move the line every other dive is judged against.
  //
  // The median is kept in both systems: metric because the accessible summary
  // formats it through `displayNumber` exactly as the visible stat above the
  // chart does - and a hardcoded decimal there would quantize an imperial figure
  // to ~5 buckets across the whole plausible RMV range, which is the collapse
  // `rmv`'s two imperial decimals exist to prevent - and converted because that
  // is the space the plot is drawn in. Ranked once in each: the conversion is a
  // single multiplication, which keeps the order, so the two rankings land on the
  // same dive.
  const medianRmv = quantile(
    points.map((point) => point.gas_use.rmv),
    0.5,
  );
  const baseline = quartiles(rmvs);

  const range = scopeRange(times, anchor, scope);

  // Fixed calendar bounds, not the min/max of what's visible: a year in which
  // you only dived in April should show one cluster on the left, not April
  // stretched across the full width as though it were the whole year.
  const x = (time: number) =>
    left + ((time - range.start) / (range.end - range.start || 1)) * plotWidth;
  const y = (rmv: number) =>
    CHART_PADDING.top +
    (1 - (rmv - domain.min) / (domain.max - domain.min)) * CHART_PLOT_HEIGHT;

  const visible = points
    .map((point, index) => ({ point, index }))
    .filter(
      ({ index }) => times[index] >= range.start && times[index] < range.end,
    );

  // Nothing drawn leaves the plot, whatever the arithmetic says. The axis is
  // scaled to the series with its outliers left off, so a dive or a bin's
  // quartile can sit just outside it - which would draw over the axis labels
  // rather than reporting anything.
  const clamp = (rmv: number) =>
    Math.min(domain.max, Math.max(domain.min, rmv));
  const outside = (rmv: number) => rmv < domain.min || rmv > domain.max;

  const showTrend = marks.includes("trend");

  // The trend mark is one idiom at every scope: the dives summarized per
  // calendar bin as a box - the median as a tick, the middle half as the box -
  // and a thin line from one bin's median to the next. What changes with the
  // scope is only the bin, which `binUnit` sizes to the axis: a day in a month,
  // a week in a year, a month across a career. Summarized over the whole series
  // and then windowed, so a week straddling New Year is the same box in both
  // years, and kept inside the plot either way. A bin cut to a sliver by the
  // window's edge - a week straddling New Year of which one day is in this year
  // - gets an inset no wider than half of what is left, so its box never has a
  // negative width.
  const unit = binUnit(range.end - range.start, plotWidth);
  const bins = binSummaries(times, rmvs, unit)
    .filter((bin) => bin.end > range.start && bin.start < range.end)
    .map((bin) => {
      const start = Math.max(left, x(bin.start));
      const end = Math.min(width, x(bin.end));
      const inset = Math.min(BIN_INSET, (end - start) / 2);
      const x0 = start + inset;
      const x1 = end - inset;

      return { ...bin, x0, x1, mid: (x0 + x1) / 2 };
    });

  const xTicks = buildXTicks(scope, range, plotWidth);
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
          unit={unit}
          onToggle={toggle}
          units={units}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Sized to exactly the chart, and the positioning context the tooltip's
          percentage offsets are resolved against. It never scrolls:
          `useChartWidth` narrows the viewBox to fit a phone instead. The legend
          sits outside it, as text that wraps to the screen. */}
      <div ref={chartRef} className="relative">
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
          viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          className="w-full h-auto overflow-visible"
          role="group"
          aria-label={describeSeries(visible.length, medianRmv, units)}
          {...readout.scrubProps}
        >
          {/* Alternating months (or years) behind the plot - the chart's
                only vertical structure, and what lets a cluster of dots be
                placed in the year without tracing down to the axis. First, so
                everything else draws over it. */}
          {bands.map((band) => (
            <rect
              key={band.start}
              x={x(band.start)}
              y={CHART_PADDING.top}
              width={x(band.end) - x(band.start)}
              height={CHART_PLOT_HEIGHT}
              fill="currentColor"
              className="text-muted"
            />
          ))}

          {/* Dashed gridlines, and only these: with a month band, the
                baseline band and the bins all sharing the plot, solid rules
                across it competed with the data instead of supporting it. */}
          <ChartYAxis ticks={ticks} y={y} left={left} width={width} />

          {xTicks.map(({ label, time }) => (
            <text
              key={label}
              aria-hidden
              x={x(time)}
              y={CHART_HEIGHT - 8}
              textAnchor="middle"
              fontSize={11}
              fill="currentColor"
              className="text-muted-foreground"
            >
              {label}
            </text>
          ))}

          {/* The career baseline: the middle half of every dive as a band,
                the median through it. A longer dash than the gridlines and a
                darker token, so it reads as a statement about the data rather
                than as part of the scale. */}
          {marks.includes("average") && (
            <>
              <rect
                x={left}
                y={y(clamp(baseline.q3))}
                width={plotWidth}
                height={y(clamp(baseline.q1)) - y(clamp(baseline.q3))}
                fill="currentColor"
                className="text-muted-foreground opacity-10"
              />
              <line
                x1={left}
                x2={width}
                y1={y(clamp(baseline.median))}
                y2={y(clamp(baseline.median))}
                stroke="currentColor"
                strokeWidth={1.5}
                strokeDasharray="7 5"
                className="text-muted-foreground opacity-70"
              />
            </>
          )}

          {marks.includes("dives") &&
            visible.map(({ point, index }) => {
              const rmv = displayRmv(point.gas_use.rmv);
              const cx = x(times[index]);
              const cy = y(clamp(rmv));
              return (
                // A plain SVG `<a>`, not `next/link`: this is inside the SVG
                // namespace, and an anchor here still gets focus, middle-click and
                // open-in-new-tab for free. `aria-label` describes the dive - the
                // tooltip below is a visual affordance and says nothing to a screen
                // reader.
                <a
                  key={point.dive_uuid}
                  href={withReturnTo(`/dives/${point.dive_uuid}`)}
                  aria-label={describePoint(point, units)}
                  data-point={index}
                  data-x={cx}
                  data-y={cy}
                  onMouseEnter={() => readout.hover(index)}
                  onMouseLeave={() => readout.hover(null)}
                  // Keyboard focus opens the tooltip too, so tabbing through the
                  // series reads the same as hovering it.
                  onFocus={() => readout.hover(index)}
                  onBlur={() => readout.hover(null)}
                  // A finger's first tap on a dot reads it, the way a hover would;
                  // the card's link, or a second tap, opens the dive.
                  onClick={(event) => {
                    if (readout.takeFirstTap(index)) event.preventDefault();
                  }}
                >
                  {/* Faded by default so overlapping dots read as density rather than
                a solid band, and lit up when it's the one being described: under
                the boxes the dots are the evidence and the box is the reading. A
                dive off the axis is pinned to its edge and drawn hollow, so it is
                still there to hover without having set the scale for every other
                dive. */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={hovered === index ? 5 : scope === "all" ? 2.5 : 3.5}
                    fill={outside(rmv) ? "none" : "currentColor"}
                    stroke={outside(rmv) ? "currentColor" : "none"}
                    strokeWidth={1.5}
                    className={cn(
                      "text-teal transition-all",
                      hovered === index ? "opacity-100" : "opacity-30",
                    )}
                  />
                  {/* An invisible, larger hit target. A 2.5-unit dot is a ~4px target
                on screen, which is a fiddly thing to hover deliberately.
                `transparent` rather than `none` - `fill="none"` takes no
                pointer events at all, which is the opposite of the point. */}
                  <circle cx={cx} cy={cy} r={7} fill="transparent" />
                </a>
              );
            })}

          {/* The bins, over the dots: the reading sits on top of its evidence,
                and the box is translucent enough for the dots to show through.
                None of it takes the pointer, so the dots underneath stay
                hoverable; the dots carry the accessible names, so this layer
                has nothing to say twice. */}
          {showTrend && (
            <g aria-hidden className="pointer-events-none text-coral">
              {bins.slice(1).map((bin, index) => {
                const previous = bins[index];
                return (
                  <line
                    key={bin.start}
                    x1={previous.mid}
                    y1={y(clamp(previous.median))}
                    x2={bin.mid}
                    y2={y(clamp(bin.median))}
                    stroke="currentColor"
                    strokeWidth={1.25}
                    // Dashed where the break in diving is long enough that a
                    // solid join would claim a steady season nobody dived.
                    strokeDasharray={
                      bin.first - previous.last > TREND_GAP_MS
                        ? "3 4"
                        : undefined
                    }
                    className="opacity-60"
                  />
                );
              })}
              {bins.map((bin) => (
                <g key={bin.start}>
                  {bin.count >= BIN_BOX_MIN_DIVES && (
                    <rect
                      x={bin.x0}
                      y={y(clamp(bin.q3))}
                      width={bin.x1 - bin.x0}
                      height={Math.max(1, y(clamp(bin.q1)) - y(clamp(bin.q3)))}
                      rx={1.5}
                      fill="currentColor"
                      stroke="currentColor"
                      strokeWidth={1}
                      className="opacity-25"
                    />
                  )}
                  <line
                    x1={bin.x0}
                    x2={bin.x1}
                    y1={y(clamp(bin.median))}
                    y2={y(clamp(bin.median))}
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                </g>
              ))}
            </g>
          )}
        </svg>

        {hoveredPoint && (
          <GasUseTooltip
            point={hoveredPoint}
            cx={x(times[hoveredIndex])}
            cy={y(clamp(displayRmv(hoveredPoint.gas_use.rmv)))}
            chartWidth={width}
            units={units}
            openHref={
              readout.pinned
                ? withReturnTo(`/dives/${hoveredPoint.dive_uuid}`)
                : undefined
            }
          />
        )}
      </div>

      <GasUseLegend marks={marks} unit={unit} onToggle={toggle} units={units} />
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
  unit,
  onToggle,
  units,
}: {
  marks: readonly GasUseMark[];
  // The bin the trend mark summarizes by *at this scope* - named whether or not
  // the mark is drawn, since the legend describes what the toggle turns on.
  unit: BinUnit;
  onToggle: (mark: GasUseMark) => void;
  units: UnitSystem;
}) {
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs touch:gap-y-0"
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
        Dive ({unitLabel("rmv", units)})
      </MarkToggle>
      <MarkToggle mark="trend" marks={marks} onToggle={onToggle}>
        {/* The box and its median tick are one mark, so they get one swatch -
            and one toggle: a line through the middle of the shading it sits in. */}
        <span aria-hidden className="relative inline-block h-2.5 w-4">
          <span
            className={cn(
              "absolute inset-0 rounded-sm bg-current opacity-25",
              marks.includes("trend") && "text-coral",
            )}
          />
          <span
            className={cn(
              "absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-current",
              marks.includes("trend") && "text-coral",
            )}
          />
        </span>
        {BIN_LABELS[unit]} median and middle half
      </MarkToggle>
      <MarkToggle mark="average" marks={marks} onToggle={onToggle}>
        <span aria-hidden className="relative inline-block h-2.5 w-4">
          <span className="absolute inset-0 rounded-sm bg-current opacity-10" />
          <span className="absolute inset-x-0 top-1/2 h-0 border-t border-dashed border-current opacity-70" />
        </span>
        All-time median and middle half
      </MarkToggle>
    </div>
  );
}

// One legend entry, as a button.
//
// `aria-pressed` rather than a checkbox: these change the picture in place, and
// the pressed state is what a screen reader needs to hear. The label stays the
// mark's own name in both states - "Show all-time median" on a control that is
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
        "inline-flex items-center gap-1.5 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch:min-h-11",
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
function describeSeries(
  dives: number,
  medianRmv: number,
  units: UnitSystem,
): string {
  // Metric in, and through the same formatter the visible "Median" stat uses, so
  // the two cannot disagree: one decimal in L/min, two in cuft/min. Spelled out
  // rather than abbreviated, because "cuft/min" read aloud is not a unit.
  return `Gas consumption over ${dives} dives, against an all-time median of ${displayNumber(
    medianRmv,
    "rmv",
    units,
    { decimals: 1 },
  )} ${unitWord("rmv", units)}.`;
}

// The hover card, at the hovered dot.
function GasUseTooltip({
  point,
  cx,
  cy,
  chartWidth,
  units,
  openHref,
}: {
  point: DiveGasUsePoint;
  cx: number;
  cy: number;
  chartWidth: number;
  units: UnitSystem;
  // Where the dive opens, for a card a finger pinned: there is no cursor on the
  // dot to click it with, so the card carries the link.
  openHref?: string;
}) {
  return (
    <ChartHoverCard cx={cx} cy={cy} chartWidth={chartWidth}>
      <div className="text-sm font-semibold">
        {displayNumber(point.gas_use.rmv, "rmv", units)}{" "}
        <span className="font-normal">{unitLabel("rmv", units)}</span>
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
        {describePointBasis(point, units)}
      </div>
      {openHref && (
        // The one part of the card that takes the pointer.
        <Link
          href={openHref}
          className="pointer-events-auto mt-1.5 flex min-h-11 items-center gap-1 border-t border-white/10 text-sm font-medium"
        >
          Open dive
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Link>
      )}
    </ChartHoverCard>
  );
}

// What the RMV above it was worked out from, which is not the same sentence for
// every dot on this chart.
//
// The split is per-tank versus whole-dive, and it is **not** the same as one
// cylinder versus several. A whole-dive point is the dive's own average depth
// over its whole duration, and saying so is what makes the figure checkable -
// that is every single-cylinder dive, and also a multi-cylinder dive whose
// cylinders were all flagged as breathed in parallel, where the API summed their
// litres against exactly that depth and duration. **An attributed point is not**:
// each cylinder is normalized against its own mean depth over the stretch it was
// breathed for - that is the entire point of the split, see `DiveTankGasUse` - so
// pairing that rate with `avg_depth` would name a denominator it was never
// divided by. On dive #493 that reads as "12.4 L/min at 20.87m" for a figure
// derived at 33.99 m.
//
// So the predicate below asks `tanks`, which is the only thing that actually
// distinguishes the two, and has always been what it asked. Nothing here changes
// for the additive path: an additive point takes the whole-dive arm and its
// `avg_depth` and `gas_used` really are the whole dive's.
//
// Its litres are understated in the same way, being the sum over attributed
// tanks only, so the two are dropped together rather than one of them being
// quietly wrong beside the other. What replaces them is the one thing a diver
// needs to read the dot correctly: this rate is per cylinder, and the detail
// page is where the cylinders are.
function describePointBasis(point: DiveGasUsePoint, units: UnitSystem): string {
  const tanks = point.gas_use.tanks?.length ?? 0;
  if (isPerTankPoint(point)) {
    return `Per tank across ${tanks} ${tanks === 1 ? "cylinder" : "cylinders"} - see the dive for the split`;
  }

  return `${formatDepth(point.avg_depth, units)} average · ${formatGasVolume(
    point.gas_use.gas_used,
    units,
  )} used`;
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

// The accessible name of a dot's link, since the visual tooltip is `aria-hidden`
// decoration.
function describePoint(point: DiveGasUsePoint, units: UnitSystem): string {
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
    : `at ${formatDepth(point.avg_depth, units)} average`;

  return `Dive #${point.dive_number}, ${date} - ${displayNumber(
    point.gas_use.rmv,
    "rmv",
    units,
  )} ${unitWord("rmv", units)} ${basis}`;
}

// Axis labels at whatever granularity the window makes readable: years across a
// whole career, months within a year, week starts within a month. All built with
// `Date.UTC`/`getUTC*`, since the times these sit alongside are wall-clock
// instants (see `diveWallClockTime`).
function buildXTicks(
  scope: ChartScope,
  range: { start: number; end: number },
  plotWidth: number,
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
    const stride = Math.ceil(
      MONTH_LABELS.length / labelCapacity(plotWidth, MONTH_LABEL_SPACING),
    );
    // Centred in the month rather than pinned to its first day, so each label
    // sits under the band it names instead of on the seam between two. Thinned
    // from December back, as the activity chart below it thins, so the two
    // stacked axes label the same months.
    return MONTH_LABELS.map((label, month) => ({
      label,
      time: (Date.UTC(year, month, 1) + Date.UTC(year, month + 1, 1)) / 2,
    })).filter((_, month) => (MONTH_LABELS.length - 1 - month) % stride === 0);
  }

  // Whole series: one label per calendar year it spans, centred in the part of
  // that year the chart actually plots. Centring is what lets the first and last
  // labels survive - a career starts partway through its first year, so a label
  // pinned to that January 1st falls outside the range and is dropped.
  const firstYear = new Date(range.start).getUTCFullYear();
  const lastYear = new Date(range.end).getUTCFullYear();
  const years = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, index) => firstYear + index,
  );

  // A long enough career runs the labels into each other, so thin them evenly
  // rather than letting them overlap.
  const stride = Math.ceil(
    years.length / labelCapacity(plotWidth, YEAR_LABEL_SPACING),
  );

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
