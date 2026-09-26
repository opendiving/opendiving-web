"use client";

import { type RefCallback, useCallback, useState } from "react";
import { fittedChartWidth } from "@/lib/chart-scale";

/**
 * The viewBox width for a chart designed `width` units wide, fitted to the
 * element the returned ref is on - see `fittedChartWidth` for the rule.
 *
 * Read as the ref attaches, which is during commit, so the first paint already
 * draws at the fitted width instead of flashing the design width at phone size;
 * a `ResizeObserver` follows the element after that. `offsetWidth` in both
 * places, so the two readings of one layout agree and cost no second render.
 *
 * @example
 * const [chartRef, chartWidth] = useChartWidth(720);
 * return (
 *   <div ref={chartRef}>
 *     <svg viewBox={`0 0 ${chartWidth} 240`} className="w-full h-auto" />
 *   </div>
 * );
 */
export function useChartWidth(
  width: number,
): [RefCallback<HTMLElement>, number] {
  const [containerPx, setContainerPx] = useState<number | null>(null);

  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) return;

    setContainerPx(element.offsetWidth);
    const observer = new ResizeObserver(() =>
      setContainerPx(element.offsetWidth),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, fittedChartWidth(width, containerPx)];
}
