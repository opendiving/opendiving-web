import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { DiveActivityChart } from "./dive-activity-chart";
import type { DiveActivityPoint } from "@/lib/api/dive-stats";
import type { ChartScope } from "@/lib/chart-period";
import { activityBars, barCeiling } from "@/lib/dive-activity";
import {
  overlappingLabels,
  sidewaysScrollers,
  withinSides,
} from "@/test/chart-layout";

// Load-bearing, as in `dive-profile-chart.browser.test.tsx`, whose first test
// fails without it: without the app's Tailwind a `min-w-*` class computes to
// nothing, so a chart wider than its container would pass everything below.
import "@/app/globals.css";

// Twenty-five years of diving, and a 2025 with a dive in every month and on
// every day of August: the widest each scope's axis gets.
const POINTS: DiveActivityPoint[] = [
  ...Array.from({ length: 25 }, (_, index) => ({
    year: 2002 + index,
    month: 6,
    day: 15,
    dives: 1 + (index % 4),
  })),
  ...Array.from({ length: 12 }, (_, index) => ({
    year: 2025,
    month: index + 1,
    day: 3,
    dives: 2,
  })),
  ...Array.from({ length: 31 }, (_, index) => ({
    year: 2025,
    month: 8,
    day: index + 1,
    dives: 1 + (index % 3),
  })),
];

const ANCHOR = Date.UTC(2025, 7, 10);

// The chart's width on the dashboard at a 375 px and a 320 px viewport, and at
// 1024 px.
const WIDTHS = { phone: 293, smallPhone: 238, desktop: 910 };
const SCOPES: ChartScope[] = ["all", "year", "month"];

const CASES = Object.entries(WIDTHS).flatMap(([name, width]) =>
  SCOPES.map((scope) => [name, scope, width] as const),
);

function renderAt(width: number, scope: ChartScope) {
  const { container } = render(
    <div style={{ width }}>
      <DiveActivityChart
        bars={activityBars(POINTS, scope, ANCHOR)}
        ceiling={barCeiling(POINTS, scope)}
        scope={scope}
      />
    </div>,
  );
  const frame = container.firstElementChild as HTMLElement;
  const svg = frame.querySelector("svg") as SVGSVGElement;
  return { frame, svg };
}

describe("the dive activity chart's layout", () => {
  it.each(CASES)(
    "draws no label over another at %s width, scope %s",
    (_, scope, width) => {
      const { svg } = renderAt(width, scope);

      expect(overlappingLabels(svg)).toEqual([]);
    },
  );

  it.each(CASES)(
    "fits %s width without scrolling sideways, scope %s",
    (_, scope, width) => {
      const { frame, svg } = renderAt(width, scope);

      expect(sidewaysScrollers(svg, frame)).toEqual([]);
    },
  );

  it.each(SCOPES)(
    "keeps the hover card inside a phone-width chart, scope %s",
    (scope) => {
      const { frame, svg } = renderAt(WIDTHS.smallPhone, scope);
      const columns = [...svg.querySelectorAll('rect[fill="transparent"]')];

      for (const column of [columns[0], columns[columns.length - 1]]) {
        fireEvent.mouseEnter(column);
        const card = frame.querySelector('[role="presentation"]') as Element;

        expect(withinSides(card, frame)).toBe(true);
        fireEvent.mouseLeave(column);
      }
    },
  );
});
