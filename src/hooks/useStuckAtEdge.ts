"use client";

import { type RefObject, useEffect, useState } from "react";
import { scrollContainerOf } from "@/hooks/useVisualViewport";

interface UseStuckAtEdgeOptions {
  /** The edge the element's `position: sticky` offset holds it to. */
  edge: "top" | "bottom";
  /**
   * Moves the root's edge to one pixel short of the line the element sticks on:
   * stuck, its outermost pixel falls outside the root and it is not wholly in
   * view, while in its own place it is.
   */
  rootMargin: string;
  /** Observe against the nearest scrolling ancestor rather than the viewport. */
  inScrollBox?: boolean;
}

/**
 * Whether a `position: sticky` element is held at the top or foot of its scroll
 * box, rather than resting in its own place or scrolled off the other side -
 * which the side of the root it leaves by tells apart.
 */
export function useStuckAtEdge(
  ref: RefObject<HTMLElement | null>,
  { edge, rootMargin, inScrollBox = false }: UseStuckAtEdgeOptions,
) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const box = entry.boundingClientRect;
        const root = entry.rootBounds;
        setStuck(
          entry.intersectionRatio < 1 &&
            (edge === "top"
              ? box.top < (root?.top ?? 0)
              : box.bottom > (root?.bottom ?? 0)),
        );
      },
      {
        root: inScrollBox ? scrollContainerOf(element) : null,
        rootMargin,
        threshold: 1,
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, edge, rootMargin, inScrollBox]);

  return stuck;
}
