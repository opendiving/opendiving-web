import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { useChartReadout } from "./useChartReadout";
import { fingerDown, fingerMove, fingerUp } from "@/test/touch";

function Plot() {
  const readout = useChartReadout((event) => event.clientX);
  return (
    <svg data-testid="plot" width={300} height={100} {...readout.scrubProps}>
      <rect width={300} height={100} />
    </svg>
  );
}

const renderPlot = () => {
  const { getByTestId } = render(<Plot />);
  return getByTestId("plot");
};

// `fireEvent` answers whether the event went uncancelled - `false` is a page
// that did not scroll.
const pageScrolls = (plot: Element) => fireEvent.touchMove(plot);

describe("useChartReadout holding the page", () => {
  it("leaves a finger that has not yet moved sideways to the page", () => {
    const plot = renderPlot();
    fingerDown(plot, { x: 100, y: 50 });
    fingerMove(plot, { x: 103, y: 70 });

    expect(pageScrolls(plot)).toBe(true);
  });

  it("keeps the page still while the finger scrubs, however it drifts", () => {
    const plot = renderPlot();
    fingerDown(plot, { x: 100, y: 50 });
    fingerMove(plot, { x: 160, y: 50 });
    fingerMove(plot, { x: 170, y: 90 });

    expect(pageScrolls(plot)).toBe(false);
  });

  it("lets the page go once the finger lifts", () => {
    const plot = renderPlot();
    fingerDown(plot, { x: 100, y: 50 });
    fingerMove(plot, { x: 160, y: 50 });
    fingerUp(plot, { x: 160, y: 50 });

    expect(pageScrolls(plot)).toBe(true);
  });
});

describe("useChartReadout under a long press", () => {
  it("keeps the system's menu off the plot while a finger is down", () => {
    const plot = renderPlot();
    fingerDown(plot, { x: 100, y: 50 });

    expect(fireEvent.contextMenu(plot)).toBe(false);
  });

  it("leaves a right click its menu", () => {
    const plot = renderPlot();
    fireEvent.pointerDown(plot, { pointerType: "mouse", isPrimary: true });

    expect(fireEvent.contextMenu(plot)).toBe(true);
  });

  it("selects nothing on the plot", () => {
    const plot = renderPlot();

    expect(getComputedStyle(plot).userSelect).toBe("none");
  });
});
