"use client";

import { useState } from "react";
import type { DiveGasUsePoint } from "@/lib/api/dive-stats";
import {
  type GasUseScope,
  RMV_TREND_WINDOW,
  TREND_GAP_DAYS,
  axisTicks,
  niceDomain,
  periodRange,
  rollingMean,
  segmentByGap,
} from "@/lib/dive-gas";
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
  scope: GasUseScope;
  // A timestamp inside the period to show. Always one of the points' own times,
  // so switching scope keeps you near the same dive. Ignored when scope is
  // "all".
  anchor: number;
}

export function GasUseChart({ points, scope, anchor }: GasUseChartProps) {
  // Index into `points` of the dive under the cursor (or keyboard focus). One
  // piece of state for the whole chart, not a tooltip component per dot: at a
  // few hundred dives, per-dot tooltip instances are a lot of machinery for one
  // that can ever be open. It also drives the dot's own highlight, so the lit
  // dot and the tooltip can't disagree the way a CSS `:hover` and React state
  // would.
  const [hovered, setHovered] = useState<number | null>(null);

  // Two points is the minimum for a horizontal axis at all: with one, every
  // timestamp maps to the same x and the scale divides by zero.
  if (points.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Log at least two dives with an average depth and tank pressures to see
        your air consumption trend.
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
  const trend = rollingMean(rmvs, RMV_TREND_WINDOW);

  const range =
    scope === "all"
      ? { start: times[0], end: times[times.length - 1] }
      : periodRange(anchor, scope);

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

  // One polyline per stretch of diving, not one across the window - see
  // `segmentByGap`. A stretch containing a single dive produces a one-point
  // polyline, which draws nothing; that dive's dot still renders below.
  const trendSegments = segmentByGap(
    visible.map(({ index }) => times[index]),
    TREND_GAP_DAYS,
  ).map((positions) =>
    positions
      .map((position) => {
        const { index } = visible[position];
        return `${x(times[index])},${y(trend[index])}`;
      })
      .join(" "),
  );

  const xTicks = buildXTicks(scope, range);

  // Cleared when the window changes out from under a hovered dot - paging from
  // 2025 to 2026 with the cursor still over the chart would otherwise leave a
  // tooltip describing a dive that's no longer drawn.
  const hoveredIndex =
    hovered !== null && visible.some(({ index }) => index === hovered)
      ? hovered
      : -1;
  const hoveredPoint = hoveredIndex >= 0 ? points[hoveredIndex] : null;

  return (
    // Wide content scrolls in its own container rather than shrinking the whole
    // chart to phone width, where the axis labels would become unreadable - same
    // treatment the gas mixtures table gets on the dive detail page.
    <div className="overflow-x-auto">
      {/* Sized to exactly the chart, and the positioning context the tooltip's
          percentage offsets are resolved against. */}
      <div className="relative min-w-[560px]">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto"
          role="img"
          aria-label={`Air consumption over ${visible.length} dives, from ${domain.min} to ${domain.max} liters per minute`}
        >
          {/* Gridlines and the y scale. `currentColor` throughout, so light/dark
            mode is inherited from the surrounding text colors rather than
            hardcoded per theme. */}
          {axisTicks(domain).map((tick) => (
            <g key={tick} className="text-border">
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="currentColor"
                strokeWidth={1}
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

          {xTicks.map(({ label, time }) => (
            <text
              key={label}
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

          {/* The trend first, so the dots sit on top of it. */}
          {trendSegments.map((segment, index) => (
            <polyline
              key={index}
              points={segment}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              className="text-coral"
            />
          ))}

          {visible.map(({ point, index }) => (
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
                  "text-teal transition-opacity",
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
  );
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
        {point.avg_depth}m average &middot; {point.gas_use.gas_used} L used
      </div>
    </div>
  );
}

// The accessible name of a dot's link - what the `<title>` element used to say,
// now that the visual tooltip is `aria-hidden` decoration.
function describePoint(point: DiveGasUsePoint): string {
  const date = formatDiveDateTime(point.start_time, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return `Dive #${point.dive_number}, ${date} - ${point.gas_use.rmv} liters per minute at ${point.avg_depth}m average`;
}

// Axis labels at whatever granularity the window makes readable: years across a
// whole career, months within a year, week starts within a month. All built with
// `Date.UTC`/`getUTC*`, since the times these sit alongside are wall-clock
// instants (see `diveWallClockTime`).
function buildXTicks(
  scope: GasUseScope,
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
    return MONTH_LABELS.map((label, month) => ({
      label,
      time: Date.UTC(year, month, 1),
    }));
  }

  // Whole series: one label per calendar year it spans, at that year's January
  // 1st, dropped when it falls outside the plotted range - which it does for the
  // first year, since the series starts partway through it.
  const firstYear = new Date(range.start).getUTCFullYear();
  const lastYear = new Date(range.end).getUTCFullYear();

  return Array.from(
    { length: lastYear - firstYear + 1 },
    (_, index) => firstYear + index,
  )
    .map((year) => ({ label: String(year), time: Date.UTC(year, 0, 1) }))
    .filter(({ time }) => time >= range.start && time <= range.end);
}
