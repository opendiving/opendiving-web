import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GasUseChart } from "./gas-use-chart";
import type { DiveGasUsePoint } from "@/lib/api/dive-stats";

// Multi-cylinder dives reach this chart for the first time in Phase 4, and they arrive
// with an RMV that was *not* divided by the dive's average depth. What a render pins is
// that the dot's own description knows the difference — the accessible name especially,
// since it is the only version of the sentence a screen-reader user gets.

function point(overrides: Partial<DiveGasUsePoint> = {}): DiveGasUsePoint {
  return {
    dive_uuid: "d1",
    dive_number: 493,
    start_time: "2026-04-17T11:49:00+02:00",
    avg_depth: 20.87,
    gas_use: { gas_used: 1520.7, rmv: 10.31, sac_bar_per_min: 0.93 },
    ...overrides,
  } as DiveGasUsePoint;
}

// Dive #493 exactly: the rate is 12.4 L/min derived at a mean 33.99 m over the attributed
// stretch, on a dive whose own average depth is 20.87 m.
function multiTankPoint(): DiveGasUsePoint {
  return point({
    gas_use: {
      gas_used: 1887,
      rmv: 12.4,
      sac_bar_per_min: null,
      tanks: [
        {
          gas_number: 0,
          gas_used: 1887,
          rmv: 12.4,
          sac_bar_per_min: 0.56,
          seconds_on_gas: 2075,
          mean_depth: 33.99,
        },
      ],
      attributed_seconds: 2075,
      duration_seconds: 4300,
    },
  });
}

// The chart shows an empty state below two dives, so every case needs a companion
// point. It is deliberately an ordinary single-cylinder one, so the assertions below
// are about the point under test rather than about the only dot on the chart.
function renderChart(points: DiveGasUsePoint[]) {
  render(
    <GasUseChart
      points={[
        point({
          dive_uuid: "d0",
          dive_number: 1,
          start_time: "2026-04-16T09:00:00+02:00",
        }),
        ...points,
      ]}
      scope="all"
      anchor={Date.parse("2026-04-17T11:49:00+02:00")}
    />,
  );
}

describe("GasUseChart point descriptions", () => {
  it("names the average depth behind a single-cylinder rate", () => {
    // Unchanged, and the reason the depth is worth naming at all: it is the
    // denominator, so quoting it makes the figure checkable.
    renderChart([point()]);

    expect(
      screen.getByLabelText(
        /Dive #493,.* 10.31 liters per minute at 20.87m average/,
      ),
    ).toBeInTheDocument();
  });

  it("does not pin a per-tank rate to the dive's average depth", () => {
    // The whole point of the split is that each cylinder is normalized against
    // its own mean depth. Naming 20.87 m beside a rate derived at 33.99 m would
    // be a denominator the figure was never divided by.
    renderChart([multiTankPoint()]);

    const dot = screen.getByLabelText(/12.4 liters per minute/);

    expect(dot).toHaveAccessibleName(/derived per cylinder/);
    expect(dot).not.toHaveAccessibleName(/20.87/);
    expect(dot).not.toHaveAccessibleName(/average/);
  });

  // The two assertions above cover the announced label. The two below cover the
  // *visible* one, which is the path almost every diver takes and which the
  // first version of this file left untested - a regression putting `avg_depth`
  // back into the tooltip while leaving the aria label alone would have shipped
  // green.
  it("does not pin the visible tooltip to the dive's average depth either", () => {
    renderChart([multiTankPoint()]);

    // Focus, not hover: the chart drives its tooltip from both, and focus is
    // the one that works without a layout engine.
    fireEvent.focus(screen.getByLabelText(/12.4 liters per minute/));

    expect(screen.getByText(/Per tank across 1 cylinder/)).toBeInTheDocument();
    expect(screen.queryByText(/20.87m average/)).not.toBeInTheDocument();
  });

  it("keeps the average depth in the tooltip of a single-cylinder dot", () => {
    renderChart([point({ dive_number: 493 })]);

    fireEvent.focus(
      screen.getByLabelText(/Dive #493,.* 10.31 liters per minute/),
    );

    expect(
      screen.getByText(/20.87m average · 1520.7 L used/),
    ).toBeInTheDocument();
  });
});
