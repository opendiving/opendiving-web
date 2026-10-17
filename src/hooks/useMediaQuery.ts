"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, following it as it changes.
 *
 * `useSyncExternalStore` rather than an effect, so the first client render
 * already has the answer. The server snapshot is `false`: the server and the
 * first client render agree on it, and a matching device switches once, after
 * hydration - so `false` should be the answer the markup is written for.
 *
 * @example
 * const isWide = useMediaQuery("(min-width: 40rem)");
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
