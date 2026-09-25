import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { GasUseChart } from "./gas-use-chart";
import type { DiveGasUsePoint } from "@/lib/api/dive-stats";
import type { ChartScope } from "@/lib/chart-period";
import { diveWallClockTime } from "@/lib/date-time";
import {
  overlappingLabels,
  sidewaysScrollers,
  withinSides,
} from "@/test/chart-layout";

// Load-bearing, as in `dive-profile-chart.browser.test.tsx`, whose first test
// fails without it: without the app's Tailwind a `min-w-*` class computes to
// nothing, so a chart wider than its container would pass everything below.
import "@/app/globals.css";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

function point(startTime: string, index: number): DiveGasUsePoint {
  return {
    dive_uuid: `d${index}`,
    dive_number: index + 1,
    start_time: startTime,
    avg_depth: 18.4,
    gas_use: { gas_used: 1520.7, rmv: 12 + (index % 7), sac_bar_per_min: 0.93 },
  } as DiveGasUsePoint;
}

// A June dive every year from 2002, then one a month through 2025 and a run of
// them in August: the most year labels the "all" axis has to thin, all twelve
// months, and a month with dots at both ends.
const POINTS = [
  ...Array.from({ length: 23 }, (_, index) => `${2002 + index}-06-15`),
  ...Array.from(
    { length: 12 },
    (_, month) => `2025-${String(month + 1).padStart(2, "0")}-10`,
  ),
  "2025-08-01",
  "2025-08-31",
  "2026-03-02",
]
  .sort()
  .map((day, index) => point(`${day}T10:00:00+02:00`, index));

const ANCHOR = diveWallClockTime("2025-08-10T10:00:00+02:00");

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
      <GasUseChart points={POINTS} scope={scope} anchor={ANCHOR} />
    </div>,
  );
  const frame = container.firstElementChild as HTMLElement;
  const svg = frame.querySelector("svg") as SVGSVGElement;
  return { frame, svg };
}

describe("the gas consumption chart's layout", () => {
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
      const dots = [...svg.querySelectorAll("a")];

      for (const dot of [dots[0], dots[dots.length - 1]]) {
        fireEvent.mouseEnter(dot);
        const card = frame.querySelector('[role="presentation"]') as Element;

        expect(withinSides(card, frame)).toBe(true);
        fireEvent.mouseLeave(dot);
      }
    },
  );
});
