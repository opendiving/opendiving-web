"use client";

import dynamic from "next/dynamic";

/**
 * The confirmation map, fetched when there is something to draw.
 *
 * `ssr: false` because the map measures its own element and reads the resolved
 * theme - neither exists on the server - and lazily because the tile grid and
 * the projection maths behind it have no business in the bundle of a page that
 * never shows a trip.
 *
 * Declared here rather than at each of the two call sites so the placeholder
 * cannot drift from the map's own height: a skeleton of a different size makes
 * the page jump when the chunk lands.
 */
export const TripLocationsMap = dynamic(() => import("./trip-locations-map"), {
  ssr: false,
  loading: () => (
    <div className="h-40 w-full animate-pulse rounded-md border bg-muted sm:h-48" />
  ),
});
