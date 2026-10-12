"use client";

import { type RefCallback, useCallback, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * The content box of the element the returned ref is on, in CSS pixels, or null
 * until it has been measured. Read as the ref attaches and followed by a
 * `ResizeObserver` after that - the same pattern as `useChartWidth`, for a box
 * whose height is fixed by the layout rather than by what is drawn in it.
 *
 * @example
 * const [areaRef, area] = useElementSize();
 * return <div ref={areaRef} className="flex-1">{area && <Plot {...area} />}</div>;
 */
export function useElementSize(): [
  RefCallback<HTMLElement>,
  ElementSize | null,
] {
  const [size, setSize] = useState<ElementSize | null>(null);

  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) return;

    const read = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
