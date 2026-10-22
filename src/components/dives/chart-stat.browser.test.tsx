import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { ChartStat, ChartStatRow } from "./chart-stat";

// Load-bearing: without the app's Tailwind neither the row's flex-wrap nor the
// inline grid columns exist, and every width would "fit".
import "@/app/globals.css";

function GasRow({ width }: { width: number }) {
  return (
    <div style={{ width }}>
      <ChartStatRow>
        <ChartStat
          label="Median"
          detail={<span className="text-xs">20% vs Oct 2025</span>}
        >
          <span className="text-base font-semibold">18.2</span>
          <span className="text-sm">L/min</span>
        </ChartStat>
        <ChartStat label="Best dive">
          <span className="text-base font-semibold">12.4</span>
          <span className="text-sm">L/min</span>
        </ChartStat>
        <ChartStat label="Dives">
          <span className="text-base font-semibold">31</span>
        </ChartStat>
      </ChartStatRow>
    </div>
  );
}

function placement(container: HTMLElement) {
  return container
    .querySelector<HTMLElement>(".group\\/stats")
    ?.getAttribute("data-detail");
}

function lines(container: HTMLElement) {
  const tops = Array.from(
    container.querySelectorAll<HTMLElement>("[data-chart-stat]"),
    (stat) => stat.offsetTop,
  );
  return new Set(tops).size;
}

describe("ChartStatRow", () => {
  it("puts the detail beside the figure when the row has room", () => {
    const { container } = render(<GasRow width={600} />);
    expect(placement(container)).toBe("inline");
    expect(lines(container)).toBe(1);
  });

  it("stacks the detail when inline would push a stat to another line", () => {
    // Wide enough for all three stats with the detail stacked, not inline.
    const { container } = render(<GasRow width={330} />);
    expect(placement(container)).toBe("stacked");
    expect(lines(container)).toBe(1);
  });

  // Resized behind React's back, as a window resize is: no render happens, so
  // only the ResizeObserver can catch it.
  it("re-decides when the row's width changes", async () => {
    const { container } = render(<GasRow width={330} />);
    const box = container.firstElementChild as HTMLElement;
    expect(placement(container)).toBe("stacked");
    box.style.width = "600px";
    await expect.poll(() => placement(container)).toBe("inline");
    box.style.width = "330px";
    await expect.poll(() => placement(container)).toBe("stacked");
  });
});
