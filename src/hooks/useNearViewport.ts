"use client";

import { useCallback, useEffect, useState } from "react";

interface UseNearViewportOptions {
  /**
   * How far outside the viewport still counts as "near". The default pulls the
   * next page in while the trigger is still below the fold, so a steady scroll
   * never stops at a spinner.
   */
  rootMargin?: string;
  /** Stop observing after the first intersection and stay `true` from then on. */
  once?: boolean;
  /** Skip observing entirely (and stay `false`) while this is false. */
  enabled?: boolean;
}

/**
 * Tracks whether an element is inside - or within `rootMargin` of - the
 * viewport.
 *
 * Returns a callback ref rather than a `RefObject` deliberately: the elements
 * this watches are conditionally rendered (the load-more button only exists
 * while there is more to load), and a `RefObject` filled in after the observing
 * effect has already run would never be observed at all. A callback ref stores
 * the node in state, so the effect re-runs when the node appears or changes.
 *
 * @example
 * const [ref, isNear] = useNearViewport<HTMLDivElement>();
 * return <div ref={ref}>{isNear ? "visible" : "off-screen"}</div>;
 */
export function useNearViewport<T extends Element>({
  rootMargin = "400px",
  once = false,
  enabled = true,
}: UseNearViewportOptions = {}): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    // Once latched, there is nothing left to watch for - and re-observing a
    // replacement node would only re-answer a question already settled.
    if (!node || !enabled || (once && isNear)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsNear(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setIsNear(false);
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [node, rootMargin, once, enabled, isNear]);

  const ref = useCallback((next: T | null) => setNode(next), []);

  return [ref, isNear];
}
