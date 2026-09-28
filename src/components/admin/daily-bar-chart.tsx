"use client";

import { barPath } from "@/lib/chart-path";
import { axisTicks, countDomain, labelCapacity } from "@/lib/chart-scale";
import { cn } from "@/lib/utils";
import { useChartWidth } from "@/hooks/useChartWidth";
import { dayLabel, type Series } from "@/components/admin/daily-stats";

// Hand-rolled SVG for the reason every chart in this app is: a `<style>`-injecting
// charting library breaks the nonce CSP in production. The geometry is the dive
// activity chart's - the same viewBox, padding and count axis - with one slot per
// day of a month and either a stack of segments or a pair of bars in each.

const WIDTH = 720;
const HEIGHT = 240;
const PADDING = { top: 12, right: 14, bottom: 28, left: 42 };
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;
const BAR_FILL = 0.7;
const BAR_RADIUS = 2;
// Room for a one- or two-digit day at `fontSize={11}`, as on the dive activity
// chart's month scope: every day at the design width, every other on a phone.
const X_LABEL_SPACING = 21;

export interface DailyBarChartProps {
  // `YYYY-MM-DD`, one per slot, in order.
  days: string[];
  // Each carries one value per day.
  series: Series[];
  // Stacked: the series add up to the day's total. Grouped: side by side, for
  // series that measure different things over the same accounts.
  layout: "stacked" | "grouped";
  // The chart's accessible name - what is counted, over what.
  description: string;
  // Said under the axes when every value is zero.
  emptyMessage: string;
}

export function DailyBarChart({
  days,
  series,
  layout,
  description,
  emptyMessage,
}: DailyBarChartProps) {
  const [chartRef, width] = useChartWidth(WIDTH);

  const dayTotal = (index: number) =>
    series.reduce((sum, one) => sum + one.values[index], 0);
  const ceiling = Math.max(
    0,
    ...days.map((_, index) =>
      layout === "stacked"
        ? dayTotal(index)
        : Math.max(0, ...series.map((one) => one.values[index])),
    ),
  );
  const isEmpty = ceiling === 0;

  // An empty month still gets its axes: a grid with nothing on it is the answer
  // "nobody came", and the frame stays the size it will be once somebody does.
  const domain = countDomain(ceiling);
  const plotWidth = width - PADDING.left - PADDING.right;
  const slot = plotWidth / Math.max(1, days.length);
  const barWidth = slot * BAR_FILL;
  const baseline = PADDING.top + PLOT_HEIGHT;
  const slotStart = (index: number) => PADDING.left + index * slot;
  const height = (count: number) => (count / domain.max) * PLOT_HEIGHT;

  // Thinned from the first of the month, which is where the eye starts reading
  // a calendar.
  const labelStride = Math.ceil(
    days.length / labelCapacity(plotWidth, X_LABEL_SPACING),
  );

  // One day's marks: segments bottom-up in legend order, or bars left to right.
  const marks = (index: number) => {
    if (layout === "grouped") {
      const each = barWidth / series.length;
      const left = slotStart(index) + (slot - barWidth) / 2;
      return series.map((one, position) => ({
        key: one.key,
        colour: one.colour,
        d: barPath(
          left + position * each,
          baseline - height(one.values[index]),
          each,
          height(one.values[index]),
          BAR_RADIUS,
        ),
      }));
    }

    let below = 0;
    return series.map((one) => {
      const value = one.values[index];
      const top = baseline - height(below + value);
      below += value;
      return {
        key: one.key,
        colour: one.colour,
        // Only the top segment would want rounded corners, and a segment a few
        // units tall can't carry them anyway, so a stack is plain rectangles.
        d: barPath(
          slotStart(index) + (slot - barWidth) / 2,
          top,
          barWidth,
          height(value),
          0,
        ),
      };
    });
  };

  // What a day held, in words: the hover title and the screen-reader list.
  const describeDay = (index: number) => {
    const counted = series
      .filter((one) => one.values[index] > 0)
      .map((one) => `${one.label} ${one.values[index]}`);
    return `${dayLabel(days[index])}: ${counted.length ? counted.join(", ") : "none"}`;
  };

  return (
    <div>
      {/* Never scrolls: `useChartWidth` narrows the viewBox on a phone instead,
          so the page keeps no horizontal scroll at 375 px. */}
      <div ref={chartRef}>
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="w-full h-auto"
          role="img"
          aria-label={description}
        >
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

          <line
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={baseline}
            y2={baseline}
            stroke="currentColor"
            strokeWidth={1}
            className="text-border"
          />

          {days.map((day, index) => (
            <g key={day}>
              {marks(index).map((mark) =>
                mark.d ? (
                  <path
                    key={mark.key}
                    d={mark.d}
                    fill="currentColor"
                    className={cn("pointer-events-none", mark.colour)}
                  />
                ) : null,
              )}
              {/* The whole column answers the hover, with the day in words -
                  a quiet day is a sliver and an empty one has no bar at all. */}
              <rect
                x={slotStart(index)}
                y={PADDING.top}
                width={slot}
                height={PLOT_HEIGHT}
                fill="transparent"
              >
                <title>{describeDay(index)}</title>
              </rect>
            </g>
          ))}

          {days.map((day, index) =>
            index % labelStride === 0 ? (
              <text
                key={day}
                aria-hidden
                x={slotStart(index) + slot / 2}
                y={HEIGHT - 8}
                textAnchor="middle"
                fontSize={11}
                fill="currentColor"
                className="text-muted-foreground"
              >
                {Number(day.slice(8))}
              </text>
            ) : null,
          )}
        </svg>
      </div>

      {isEmpty && (
        <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
      )}

      {/* The key, with each series' total for the month - the figure the bars
          are worst at giving exactly. */}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {series.map((one) => (
          <li key={one.key} className="flex items-center gap-1.5">
            <svg
              aria-hidden
              viewBox="0 0 10 10"
              className={cn("h-2.5 w-2.5 shrink-0", one.colour)}
            >
              <rect width={10} height={10} rx={2} fill="currentColor" />
            </svg>
            <span>{one.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {one.values.reduce((sum, value) => sum + value, 0)}
            </span>
          </li>
        ))}
      </ul>

      <ul className="sr-only">
        {days.map((day, index) => (
          <li key={day}>{describeDay(index)}</li>
        ))}
      </ul>
    </div>
  );
}
