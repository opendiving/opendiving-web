import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { DiveProfileChart } from "./dive-profile-chart";
import type { DiveProfile } from "@/lib/api/dives";
import { CHART_FULL_WIDTH_PX } from "@/lib/chart-scale";
import {
  overlappingLabels,
  sidewaysScrollers,
  withinSides,
} from "@/test/chart-layout";

// Load-bearing: the browser project loads none of this app's Tailwind, and
// without it a `min-w-*` class computes to nothing, so a chart wider than its
// container would pass every assertion below. The first test fails loudly if
// this import goes.
import "@/app/globals.css";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

// A 19 m dive with a full deco panel. Depth's axis ends on 20 and the NDL row's
// begins at 100 min, which is the pair that touched; the ppO₂ and percent rows
// put two more row boundaries under it, and temperature labels the right edge.
const times = Array.from({ length: 11 }, (_, index) => index * 300_000);
const PROFILE: DiveProfile = {
  duration: 3_000_000,
  depth: {
    times,
    values: [0, 1200, 1900, 1900, 1800, 1700, 1500, 1200, 800, 500, 0],
  },
  temperature: {
    times,
    values: [260, 250, 240, 235, 232, 230, 230, 232, 238, 245, 252],
  },
  pressures: [],
  ndl: {
    times,
    values: [5940, 3600, 1800, 1500, 1500, 1600, 1900, 2400, 3600, 5940, 5940],
  },
  tts: { times, values: [0, 60, 120, 180, 180, 120, 60, 60, 0, 0, 0] },
  ppo2: { times, values: [21, 45, 61, 61, 59, 57, 53, 46, 38, 31, 21] },
  cns: { times, values: [0, 2, 4, 6, 8, 9, 10, 11, 12, 12, 12] },
  gradient_factor: {
    times,
    values: [0, 10, 25, 38, 45, 52, 58, 60, 55, 40, 20],
  },
  events: [],
};

// The chart's width on a dive page at a 375 px and a 320 px viewport, and at
// 1024 px, where the page gets its sidebar.
const WIDTHS = { phone: 293, smallPhone: 238, desktop: 582 };

function renderAt(width: number) {
  const { container } = render(
    <div style={{ width }}>
      <DiveProfileChart profile={PROFILE} />
    </div>,
  );
  const frame = container.firstElementChild as HTMLElement;
  const svg = frame.querySelector("svg") as SVGSVGElement;
  return { frame, svg };
}

describe("the dive profile chart's layout", () => {
  it("is laid out by the app's stylesheet", () => {
    // What makes the rest of this file mean anything - see the import above.
    const { svg } = renderAt(WIDTHS.phone);

    expect(getComputedStyle(svg.parentElement as Element).position).toBe(
      "relative",
    );
  });

  it.each(Object.entries(WIDTHS))(
    "draws no label over another at %s width",
    (_, width) => {
      const { svg } = renderAt(width);

      expect(overlappingLabels(svg)).toEqual([]);
    },
  );

  it.each(Object.entries(WIDTHS))(
    "fits %s width without scrolling sideways",
    (_, width) => {
      const { frame, svg } = renderAt(width);

      expect(sidewaysScrollers(svg, frame)).toEqual([]);
    },
  );

  it("keeps the type at the size it has at the full-width breakpoint", () => {
    // Fitting a phone by shrinking the whole drawing would pass both tests
    // above with labels a third of their size.
    const { svg } = renderAt(WIDTHS.phone);
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;

    expect(scale).toBeCloseTo(CHART_FULL_WIDTH_PX / 720);
  });

  it("keeps the hover card inside the chart wherever the crosshair is", () => {
    const { frame, svg } = renderAt(WIDTHS.phone);
    const target = svg.querySelector('rect[fill="transparent"]') as Element;
    const box = target.getBoundingClientRect();

    for (let step = 0; step <= 50; step++) {
      fireEvent.mouseMove(target, {
        clientX: box.left + (box.width * step) / 50,
        clientY: box.top + box.height / 3,
      });
      const card = frame.querySelector('[role="presentation"]') as Element;

      expect(withinSides(card, frame), `at ${step * 2}%`).toBe(true);
    }
  });
});
