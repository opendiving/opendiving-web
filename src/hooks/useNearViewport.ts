"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
 * The third return is `recheck`, for a caller that has just moved the observed
 * element itself; see its own comment.
 *
 * @example
 * const [ref, isNear] = useNearViewport<HTMLDivElement>();
 * return <div ref={ref}>{isNear ? "visible" : "off-screen"}</div>;
 */
export function useNearViewport<T extends Element>({
  rootMargin = "400px",
  once = false,
  enabled = true,
}: UseNearViewportOptions = {}): [
  (node: T | null) => void,
  boolean,
  () => void,
] {
  const [node, setNode] = useState<T | null>(null);
  const [isNear, setIsNear] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  // `once`'s latch, held in a ref rather than read back off `isNear`, so that
  // the answer changing does not tear the observer down and build a new one.
  // `recheck` re-observes through the live instance, and would otherwise be
  // racing a teardown its own `setIsNear` had scheduled.
  const latched = useRef(false);

  useEffect(() => {
    // Once latched, there is nothing left to watch for - and re-observing a
    // replacement node would only re-answer a question already settled.
    if (!node || !enabled || (once && latched.current)) return;

    const current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (once) {
            latched.current = true;
            current.disconnect();
          }
          setIsNear(true);
        } else if (!once) {
          setIsNear(false);
        }
      },
      { rootMargin },
    );

    observer.current = current;
    current.observe(node);
    return () => {
      current.disconnect();
      if (observer.current === current) observer.current = null;
    };
  }, [node, rootMargin, once, enabled]);

  const ref = useCallback((next: T | null) => setNode(next), []);

  /**
   * Throw the current answer away and ask the observer for a fresh one.
   *
   * An `IntersectionObserver` reports threshold crossings, so an element that
   * stays intersecting while the layout around it changes is never mentioned
   * again - `isNear` goes on describing where the element was when it was last
   * observed. A caller that has itself just moved the element (appending rows
   * above it, say) is holding an answer to the wrong question, and cannot wait
   * for the observer to volunteer a correction: it only arrives if the element
   * crossed a threshold, and it arrives a frame or more late either way.
   *
   * Re-observing resets the target's remembered state, so the next observation
   * is delivered whichever way it comes out. `isNear` drops to `false` in the
   * meantime, which is the honest reading of "not answered yet" - and, for the
   * caller that acts on the rising edge, what makes the fresh `true` an edge.
   */
  const recheck = useCallback(() => {
    const current = observer.current;
    if (!current || !node || once) return;

    setIsNear(false);
    current.unobserve(node);
    current.observe(node);
  }, [node, once]);

  return [ref, isNear, recheck];
}
