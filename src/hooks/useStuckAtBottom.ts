"use client";

import { type RefObject, useEffect, useState } from "react";
import { scrollContainerOf } from "@/hooks/useVisualViewport";

interface UseStuckAtBottomOptions {
  /**
   * Moves the root's bottom edge to one pixel short of the line the element
   * sticks on: stuck, its last pixel falls outside the root and it is not wholly
   * in view, while in its own place it is.
   */
  rootMargin: string;
  /** Observe against the nearest scrolling ancestor rather than the viewport. */
  inScrollBox?: boolean;
}

/**
 * Whether a `position: sticky` element with a `bottom` offset is held at the
 * foot of its scroll box, rather than resting in its own place or scrolled off
 * the top - which the side of the root it leaves by tells apart.
 */
export function useStuckAtBottom(
  ref: RefObject<HTMLElement | null>,
  { rootMargin, inScrollBox = false }: UseStuckAtBottomOptions,
) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setStuck(
          entry.intersectionRatio < 1 &&
            entry.boundingClientRect.bottom > (entry.rootBounds?.bottom ?? 0),
        ),
      {
        root: inScrollBox ? scrollContainerOf(element) : null,
        rootMargin,
        threshold: 1,
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, inScrollBox]);

  return stuck;
}
