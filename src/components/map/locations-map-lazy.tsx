"use client";

import dynamic from "next/dynamic";

/**
 * The read-only map, fetched when there is something to draw.
 *
 * `ssr: false` because the map measures its own element and reads the resolved
 * theme - neither exists on the server - and lazily because the tile grid and
 * the projection maths behind it have no business in the bundle of a page that
 * never shows a place.
 *
 * Declared here rather than at each call site so the placeholder cannot drift
 * from the map's own height: a skeleton of a different size makes the page jump
 * when the chunk lands.
 */
export const LocationsMap = dynamic(() => import("./locations-map"), {
  ssr: false,
  loading: () => (
    <div className="h-40 w-full animate-pulse rounded-md border bg-muted sm:h-48" />
  ),
});
