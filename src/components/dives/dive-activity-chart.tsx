"use client";

import { useRef, useState } from "react";
import { barPath } from "@/lib/chart-path";
import { axisTicks, countDomain, labelCapacity } from "@/lib/chart-scale";
import type { ChartScope } from "@/lib/chart-period";
import type { ActivityBar } from "@/lib/dive-activity";
import { cn } from "@/lib/utils";
import { useChartWidth } from "@/hooks/useChartWidth";
import { useKeepInside } from "@/hooks/useKeepInside";

// Hand-rolled SVG, for the reasons `gas-use-chart.tsx` sets out at length: the
// app ships a strict nonce-based CSP that a `<style>`-injecting charting library
// would break in production but not in dev, and this is the third chart to make
// the same call.
//
// `--teal` for the bars, because teal already means "a dive" on the gas chart
// sitting directly above this one, and these bars are dives counted. Declared
// once and never redeclared under `.dark` (see `globals.css`), so it holds its
// contrast in both themes - which `--primary`, near-black in light mode and mid
// grey in dark, does not.

// The viewBox coordinate space, matched to the gas chart's so the two cards'
// plots line up down the dashboard rather than being a few units out - and, like
// it, the design width, narrowed on a phone by `useChartWidth`.
const WIDTH = 720;
const HEIGHT = 240;
const PADDING = { top: 12, right: 14, bottom: 28, left: 42 };

const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

// How much of its slot a bar fills. The rest is the gap, and the gap is what
// makes twelve bars read as twelve months rather than as one block.
const BAR_FILL = 0.64;

// Bars stop widening past this, so a career of two years doesn't draw two
// 200-unit slabs. They stay centred in their slots, so the spacing still says
// what the axis says.
const MAX_BAR_WIDTH = 52;

const BAR_RADIUS = 3;

// The room each x label gets before the axis starts skipping them, per scope, in
// viewBox units.
//
// Tighter than the gas chart's years, and deliberately: there, labels sit at
// whatever x the data lands on and can crowd each other locally; here they are
// one per evenly spaced slot, so the only thing that matters is the arithmetic -
// how wide a label is against the plot it has to divide.
//
// A four-digit year at `fontSize={11}` is about 27 units wide, so 33 fits twenty
// of them across the design width's 664-unit plot. A three-letter month is at
// most 22 ("May"), and 26 still labels all twelve on a 375 px phone. A one- or
// two-digit day is about 13, and 21 labels every day of a month at the design
// width rather than counting down from the 31st in twos, which is how a thinned
// day axis reads.
const X_LABEL_SPACING: Record<ChartScope, number> = {
  all: 33,
  year: 26,
  month: 21,
};

export interface DiveActivityChartProps {
  // Exactly the bars to draw, in calendar order and including the empty ones -
  // `activityBars` builds them. The chart deliberately does no bucketing of its
  // own: what a bar means is the card's decision, and everything here is
  // geometry.
  bars: ActivityBar[];
  // The tallest bar this scope can produce across the whole logbook, not across
  // `bars`. Scaling to the visible year would make every year's busiest month
  // full height and the arrows compare nothing - see `barCeiling`.
  ceiling: number;
  // The chart's accessible description, and how much room each x label needs
  // (see `X_LABEL_SPACING`). Nothing about the plot's own geometry depends on it -
  // that all follows from `bars.length`.
  scope: ChartScope;
}

export function DiveActivityChart({
  bars,
  ceiling,
  scope,
}: DiveActivityChartProps) {
  // One hovered index for the whole chart rather than a tooltip component per
  // bar - the same call, for the same reason, as the gas chart's dots: only one
  // can ever be open, and shared state means the lit bar and the card it
  // describes cannot disagree.
  const [hovered, setHovered] = useState<number | null>(null);
  const [chartRef, width] = useChartWidth(WIDTH);

  const total = bars.reduce((sum, bar) => sum + bar.dives, 0);

  // No two-bar minimum, unlike the gas chart. That one needs two points to have
  // a horizontal axis at all; a single bar is a perfectly readable answer to
  // "how much have I been diving".
  //
  // The test is the total rather than the number of bars, because the bounded
  // scopes always produce a full calendar's worth of them - a grid of nothing is
  // not a chart. In practice only an empty logbook reaches this: the period
  // control offers only periods that contain dives. It also keeps `describeBars`
  // off an empty array, where its `reduce` would throw.
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Log a dive to see how much you have been diving.
      </p>
    );
  }

  const domain = countDomain(ceiling);

  const slot = (width - PADDING.left - PADDING.right) / bars.length;
  const barWidth = Math.min(slot * BAR_FILL, MAX_BAR_WIDTH);
  const baseline = PADDING.top + PLOT_HEIGHT;

  const slotStart = (index: number) => PADDING.left + index * slot;
  const center = (index: number) => slotStart(index) + slot / 2;
  const height = (dives: number) => (dives / domain.max) * PLOT_HEIGHT;

  // Thinned from the right, so the most recent year always keeps its label -
  // it's the one the eye goes to, and dropping it to keep 1998's would be the
  // wrong half of the axis to preserve.
  const labelStride = Math.ceil(
    bars.length /
      labelCapacity(
        width - PADDING.left - PADDING.right,
        X_LABEL_SPACING[scope],
      ),
  );
  const labelled = (index: number) =>
    (bars.length - 1 - index) % labelStride === 0;

  return (
    <div>
      {/* Sized to exactly the chart, and the positioning context the tooltip's
          percentage offsets are resolved against. It never scrolls:
          `useChartWidth` narrows the viewBox to fit a phone instead. */}
      <div ref={chartRef} className="relative">
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="w-full h-auto"
          // `img`, not the gas chart's `group`: there is nothing focusable
          // inside this one. The bars aren't links - a month is not a page -
          // so the summary below plus the visually hidden list after it carry
          // the whole picture.
          role="img"
          aria-label={describeBars(bars, scope, total)}
        >
          {/* Gridlines and the y scale, `aria-hidden` because `role="img"`
                does not reliably keep bare `<text>` out of the accessibility
                tree - the same note the profile chart carries. Dashed, so they
                support the bars rather than compete with them. */}
          {axisTicks(domain).map((tick) => (
            <g key={tick} aria-hidden className="text-border">
              <line
                x1={PADDING.left}
                x2={width - PADDING.right}
                y1={baseline - height(tick)}
                y2={baseline - height(tick)}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="2 4"
              />
              <text
                x={PADDING.left - 8}
                y={baseline - height(tick)}
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

          {/* The axis itself - solid, so the bars have a floor to stand on
                rather than another dashed rule to be confused with. */}
          <line
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={baseline}
            y2={baseline}
            stroke="currentColor"
            strokeWidth={1}
            className="text-border"
          />

          {bars.map((bar, index) => (
            <g key={bar.key}>
              {/* The whole column is the hover target, not just the bar. A
                    quiet January is a few units tall and an empty one has no
                    bar at all, and "how many dives was that month" is exactly
                    the question you'd point at them to ask. `transparent`
                    rather than `fill="none"`, which takes no pointer events. */}
              <rect
                x={slotStart(index)}
                y={PADDING.top}
                width={slot}
                height={PLOT_HEIGHT}
                fill="transparent"
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
              />
              <path
                d={barPath(
                  center(index) - barWidth / 2,
                  baseline - height(bar.dives),
                  barWidth,
                  height(bar.dives),
                  BAR_RADIUS,
                )}
                fill="currentColor"
                // Faded by default and lit on hover, so a row of bars reads as
                // one series and the hovered one as the one being described -
                // the same treatment the gas chart's dots get. `pointer-events
                // -none` so the bar never steals its own column's hover and
                // flickers along the top edge.
                className={cn(
                  "pointer-events-none text-teal transition-opacity",
                  hovered === index ? "opacity-100" : "opacity-70",
                )}
              />
            </g>
          ))}

          {bars.map((bar, index) =>
            labelled(index) ? (
              <text
                key={bar.key}
                aria-hidden
                x={center(index)}
                y={HEIGHT - 8}
                textAnchor="middle"
                fontSize={11}
                fill="currentColor"
                className={cn(
                  "transition-colors",
                  hovered === index
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {bar.label}
              </text>
            ) : null,
          )}
        </svg>

        {hovered !== null && (
          <DiveActivityTooltip
            bar={bars[hovered]}
            cx={center(hovered)}
            cy={baseline - height(bars[hovered].dives)}
            chartWidth={width}
          />
        )}
      </div>

      {/* The figures themselves, for a screen reader. The chart's own label is a
          sentence - it can say how much diving and when the busiest of it was,
          but not what every bucket held, and rounding a year down to its headline
          is exactly what a sighted reader doesn't have to accept here. Cheap at
          this size: a month's days, twelve months, or one entry per year of a
          career.

          Pluralized, unlike when this list only ever held months and years: a
          bucket of exactly one dive is the common case at the day scope, and
          "1 dives" read aloud is worse than it looks written down. */}
      <ul className="sr-only">
        {bars.map((bar) => (
          <li key={bar.key}>
            {bar.name}:{" "}
            {bar.dives === 0
              ? "no dives"
              : `${bar.dives} ${bar.dives === 1 ? "dive" : "dives"}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

// What one bar counts, in the scope's own words.
const BAR_UNITS: Record<ChartScope, string> = {
  all: "year",
  year: "month",
  month: "day",
};

// The chart's accessible name. Frames the list that follows it rather than
// repeating it: what is being counted, over what, and where the peak was.
//
// The peak carries its unit for the same reason the list below pluralizes: this
// is read aloud, and a sentence ending "August 12, 2025, 1." leaves the listener
// to infer what the 1 counts from a phrase four words back. The leading "Dives
// per day" is doing that work for a sighted skim and not for a spoken one.
function describeBars(
  bars: ActivityBar[],
  scope: ChartScope,
  total: number,
): string {
  const per = BAR_UNITS[scope];
  const busiest = bars.reduce((best, bar) =>
    bar.dives > best.dives ? bar : best,
  );
  const dives = `${busiest.dives} ${busiest.dives === 1 ? "dive" : "dives"}`;

  return `Dives per ${per}, ${total} in total. Busiest ${per}: ${busiest.name}, ${dives}.`;
}

// The hover card. HTML rather than SVG `<text>` so it gets the app's popover
// tokens, a border and a shadow - see `GasUseTooltip`, whose positioning this
// shares: percentages of the chart box, which works because the SVG scales
// uniformly inside a wrapper of exactly its size.
function DiveActivityTooltip({
  bar,
  cx,
  cy,
  chartWidth,
}: {
  bar: ActivityBar;
  cx: number;
  cy: number;
  chartWidth: number;
}) {
  // Flipped and nudged so the card lands inside the chart box, as the gas
  // chart's does. A full-height bar's top is at the very top of the plot, so this
  // flips more often than that one.
  const cardRef = useRef<HTMLDivElement>(null);
  useKeepInside(cardRef);
  const below = cy < HEIGHT * 0.35;
  const translateY = below ? "12px" : "calc(-100% - 12px)";
  const translateX =
    cx < chartWidth * 0.18
      ? "-12px"
      : cx > chartWidth * 0.82
        ? "calc(-100% + 12px)"
        : "-50%";

  return (
    <div
      ref={cardRef}
      // Never a hover target itself - it sits over the column that opened it,
      // and letting it take the pointer would make it flicker.
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-white/10 bg-tooltip px-3 py-2 text-tooltip-foreground shadow-lg"
      style={{
        left: `${(cx / chartWidth) * 100}%`,
        top: `${(cy / HEIGHT) * 100}%`,
        transform: `translate(${translateX}, ${translateY})`,
      }}
      role="presentation"
    >
      <div className="text-sm font-semibold">
        {bar.dives}{" "}
        <span className="font-normal">
          {bar.dives === 1 ? "dive" : "dives"}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-tooltip-foreground/70">
        {bar.name}
      </div>
    </div>
  );
}
