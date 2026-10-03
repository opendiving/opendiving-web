// The grid every tile belongs to: Web Mercator in GL JS's units - a 512 px
// tile, which is also the size the map renderer draws one at - its projection,
// and the middle of a square of it.
//
// A module of its own because the renderer imports it: its signature hashes
// every source that reaches its bundle, so what lives here is what decides a
// tile's pixels and nothing about how a card or a hero lays them out.

import type { LatLon } from "@/lib/basemap";

export const TILE_SIZE = 512;

// GL JS's own projection, in its own spelling, so the two agree to the last
// bit rather than to a rounding.
export const mercatorX = (longitude: number) => (180 + longitude) / 360;
export const mercatorY = (latitude: number) =>
  (180 -
    (180 / Math.PI) *
      Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360))) /
  360;
export const longitudeAt = (x: number) => x * 360 - 180;
export const latitudeAt = (y: number) =>
  (360 / Math.PI) * Math.atan(Math.exp(((180 - y * 360) * Math.PI) / 180)) - 90;

/** The middle of tile `z/x/y`, which the renderer draws the tile around. */
export function tileCenter(z: number, x: number, y: number): LatLon {
  const tiles = 2 ** z;
  return {
    latitude: latitudeAt((y + 0.5) / tiles),
    longitude: longitudeAt((x + 0.5) / tiles),
  };
}
