import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { DailyBarChart } from "./daily-bar-chart";
import type { Series } from "./daily-stats";
import { overlappingLabels, sidewaysScrollers } from "@/test/chart-layout";

// Load-bearing, as in the dive charts' layout tests: without the app's Tailwind a
// width class computes to nothing and a chart wider than its box passes.
import "@/app/globals.css";

// A 31-day month, and a stack of six series tall enough to need a two-digit axis.
const DAYS = Array.from(
  { length: 31 },
  (_, index) => `2026-08-${String(index + 1).padStart(2, "0")}`,
);
const SERIES: Series[] = Array.from({ length: 6 }, (_, index) => ({
  key: `s${index}`,
  label: `Series ${index}`,
  colour: "text-teal",
  values: DAYS.map((_, day) => (day * (index + 1)) % 7),
}));

// The card's content box at a 375 px and a 320 px viewport, and at 1024 px.
const WIDTHS = { phone: 293, smallPhone: 238, desktop: 910 };
const CASES = Object.entries(WIDTHS).flatMap(([name, width]) =>
  (["stacked", "grouped"] as const).map(
    (layout) => [name, layout, width] as const,
  ),
);

function renderAt(width: number, layout: "stacked" | "grouped") {
  const { container } = render(
    <div style={{ width }}>
      <DailyBarChart
        days={DAYS}
        series={SERIES}
        layout={layout}
        description="A month"
        emptyMessage="Nothing"
      />
    </div>,
  );
  const frame = container.firstElementChild as HTMLElement;
  const svg = frame.querySelector("svg[role='img']") as SVGSVGElement;
  return { frame, svg };
}

describe("the daily bar chart's layout", () => {
  it.each(CASES)(
    "draws no label over another at %s width, %s",
    (_, layout, width) => {
      const { svg } = renderAt(width, layout);

      expect(overlappingLabels(svg)).toEqual([]);
    },
  );

  it.each(CASES)(
    "fits %s width without scrolling sideways, %s",
    (_, layout, width) => {
      const { frame, svg } = renderAt(width, layout);

      expect(sidewaysScrollers(svg, frame)).toEqual([]);
      expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
    },
  );
});
