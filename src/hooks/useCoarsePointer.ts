"use client";

import { useSyncExternalStore } from "react";

// Asks about the pointer rather than the screen. A tablet at desktop width is
// still driven by a finger, and a laptop at phone width is still driven by a
// mouse, so a width breakpoint gets both of them wrong; `hover: none` is what
// separates the two, with `pointer: coarse` keeping a stylus-and-mouse hybrid on
// the desktop path it can actually use.
const COARSE_POINTER = "(hover: none) and (pointer: coarse)";

/**
 * Whether the primary pointer is a finger - a phone or a tablet, not a laptop
 * with a touchscreen.
 *
 * The server snapshot is `false`, so the server and the first client render
 * agree on the desktop answer and a touch device switches once, after
 * hydration. A caller that swaps one control for another on the strength of
 * this therefore renders the desktop control into the HTML; rendering both and
 * hiding one is the trap "`FormControl` only labels what it can reach" in
 * DECISIONS.md describes, since two controls cannot share one label's `for`.
 *
 * @example
 * const coarsePointer = useCoarsePointer();
 * return coarsePointer ? <NativePicker {...props} /> : <CalendarPicker {...props} />;
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const query = window.matchMedia(COARSE_POINTER);
      query.addEventListener("change", onStoreChange);
      return () => query.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia(COARSE_POINTER).matches,
    () => false,
  );
}
