"use client";

import dynamic from "next/dynamic";

/**
 * The read-only map, fetched when there is something to draw.
 *
 * `ssr: false` because the map needs a WebGL2 context, a real element to attach
 * to and the resolved theme, none of which exist on the server - and lazily
 * because MapLibre is around 250 KB gzipped and has no business in the bundle
 * of a page that never shows a place.
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
