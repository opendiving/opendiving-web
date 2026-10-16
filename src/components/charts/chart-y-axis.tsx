import { CHART_PADDING, CHART_PLOT_HEIGHT } from "@/lib/chart-scale";

export interface ChartYAxisProps {
  // The gridline values, bottom first - `axisTicks` of the chart's domain.
  ticks: number[];
  // A value's y in the chart's viewBox.
  y: (value: number) => number;
  // The chart's viewBox width, from `useChartWidth`.
  width: number;
}

// The y scale of a chart drawn in the shared `CHART_PADDING` frame: dashed
// gridlines with their labels, and the solid baseline closing the plot.
//
// Dashed, so they support the data rather than compete with it. `currentColor`
// throughout, so light and dark mode come from the surrounding text colors
// rather than being hardcoded per theme. `aria-hidden` because the axis is a
// reading aid for the eye, and `role="img"` does not reliably keep bare `<text>`
// out of the accessibility tree; each chart's own label and list carry what
// these numbers say.
export function ChartYAxis({ ticks, y, width }: ChartYAxisProps) {
  const baseline = CHART_PADDING.top + CHART_PLOT_HEIGHT;

  return (
    <>
      {ticks.map((tick) => (
        <g key={tick} aria-hidden className="text-border">
          <line
            x1={CHART_PADDING.left}
            x2={width - CHART_PADDING.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
          <text
            x={CHART_PADDING.left - 8}
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

      {/* The one solid rule, along the bottom: the marks' floor, which dashed
          would read as another gridline. */}
      <line
        x1={CHART_PADDING.left}
        x2={width - CHART_PADDING.right}
        y1={baseline}
        y2={baseline}
        stroke="currentColor"
        strokeWidth={1}
        className="text-border"
      />
    </>
  );
}
