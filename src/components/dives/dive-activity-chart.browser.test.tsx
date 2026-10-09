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
import {
  centreOf,
  fingerDown,
  fingerMove,
  fingerUp,
  pressElsewhere,
  tap,
} from "@/test/touch";

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

// The chart's width on the Home page at a 375 px and a 320 px viewport, and at
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

describe("the dive activity chart under a finger", () => {
  const bars = activityBars(POINTS, "year", ANCHOR);

  function renderYear() {
    const { frame, svg } = renderAt(WIDTHS.phone, "year");
    const columns = [...svg.querySelectorAll('rect[fill="transparent"]')];
    const card = () => frame.querySelector('[role="presentation"]');
    return { svg, columns, card };
  }

  it("reads the column a tap lands on, and keeps it after the finger lifts", () => {
    const { columns, card } = renderYear();

    tap(columns[3], centreOf(columns[3]));

    expect(card()).toHaveTextContent(bars[3].name);
  });

  it("scrubs across the columns as the finger drags sideways", () => {
    const { columns, card } = renderYear();

    fingerDown(columns[1], centreOf(columns[1]));
    // Pointer capture keeps every move on the column the finger went down on.
    fingerMove(columns[1], centreOf(columns[8]));
    expect(card()).toHaveTextContent(bars[8].name);

    fingerUp(columns[1], centreOf(columns[8]));
    expect(card()).toHaveTextContent(bars[8].name);
  });

  it("lets go when a finger presses anywhere else", () => {
    const { columns, card } = renderYear();
    tap(columns[3], centreOf(columns[3]));

    pressElsewhere();

    expect(card()).toBeNull();
  });

  it("is not cleared by the mouse events a browser sends after a tap", () => {
    const { columns, card } = renderYear();
    tap(columns[3], centreOf(columns[3]));

    fireEvent.mouseEnter(columns[3]);
    fireEvent.mouseLeave(columns[3]);

    expect(card()).toHaveTextContent(bars[3].name);
  });

  it("leaves a vertical swipe to the page", () => {
    const { svg } = renderYear();

    expect(getComputedStyle(svg).touchAction).toBe("pan-y pinch-zoom");
  });
});
