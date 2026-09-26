"use client";

import { type RefObject, useLayoutEffect } from "react";

/**
 * Nudges an absolutely positioned element sideways, after every render and
 * before paint, so it stays inside the box it is positioned against (its
 * `offsetParent`). One wider than that box is aligned to its left edge.
 *
 * For the charts' hover cards, which are placed at the point they describe and
 * are as wide as what they say. At phone width a card near either edge would
 * otherwise hang past the chart and scroll the page sideways.
 *
 * Written to the `translate` property, which composes with the `transform` the
 * card's own placement sets instead of replacing it, and which React leaves
 * alone because no `style` prop names it.
 *
 * @example
 * const cardRef = useRef<HTMLDivElement>(null);
 * useKeepInside(cardRef);
 * return <div ref={cardRef} className="absolute" style={{ left: "90%" }} />;
 */
export function useKeepInside(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    const frame = element?.offsetParent;
    if (!element || !frame) return;

    element.style.translate = "";
    const outer = frame.getBoundingClientRect();
    const inner = element.getBoundingClientRect();
    const shift = Math.max(
      outer.left - inner.left,
      Math.min(0, outer.right - inner.right),
    );
    if (shift !== 0) element.style.translate = `${shift}px`;
  });
}
