// What a card's map picture and the maps the browser draws have to agree on: the
// picture's size, how a place becomes an extent, the band of a frame its pins are
// kept to, and the smallest frame a card gives its map.
//
// Imported by the web's maps and by the map renderer (`src/map-renderer/`), which
// runs in Node - so nothing here may import anything that needs a browser, or
// anything that needs a server.

import type { LatLonBounds } from "@/lib/basemap";

// The size every picture is drawn at, in CSS pixels: wider and taller than any
// frame a trip card gives the map - the widest is /trips' single column just
// below `lg`, a little under 980 - so a frame only ever shows a part of it, and
// a resize moves the picture rather than asking for a new one.
export const SNAPSHOT_WIDTH = 1024;
export const SNAPSHOT_HEIGHT = 512;

// How far in from each side a picture dissolves into the page where a frame is
// wider than it - a detail page's hero on a desktop window. A quarter of the
// picture: wide enough that the eye finds no edge, and leaves the middle half
// for the pins.
export const SIDE_FADE_WIDTH = SNAPSHOT_WIDTH / 4;

// Breathing room between the outermost place and the edge of the frame, so a
// pin never sits on the border where half of its context is cropped away.
export const FIT_PADDING = 24;

// Where the places have to land, as padding from a frame's top and bottom:
// clear of whatever the caller covers the foot with, and of a backdrop's credit
// over the top edge. Never so small that nothing fits: MapLibre then refuses
// the fit and leaves the camera wherever it was.
export function bandIn(
  height: number,
  creditBottom: number,
  coveredBottom: number,
): { top: number; bottom: number } {
  const top = FIT_PADDING + creditBottom;
  return {
    top,
    bottom: Math.min(FIT_PADDING + coveredBottom, height - top - FIT_PADDING),
  };
}

/**
 * As much of a place as a map needs: its position, its footprint where it has
 * one, and a name for a pointer and a screen reader. Loose enough to take a trip
 * location - both what the API returns and what the form holds while it is
 * being edited - as well as a dive site, which carries the same fields under the
 * same names. The name is optional because the map renderer draws no text for a
 * place and is never sent one.
 */
export interface MappableLocation {
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
  bbox_south?: number | null;
  bbox_north?: number | null;
  bbox_west?: number | null;
  bbox_east?: number | null;
  /**
   * How the marker is drawn: the default solid dot for a place somebody chose,
   * or a hollow ring for a `"fix"` - a position a device recorded, which is not
   * the same claim at all. A dive's entry and exit fixes are the only ones so
   * far, and a mis-pinned site or a fix a kilometre off the site is the thing
   * the two shapes make visible at a glance.
   *
   * Deliberately not `kind: "site" | "gps"` or anything else domain-shaped:
   * a map knows about positions and names, and one optional styling field is
   * what keeps it that way.
   */
  variant?: "pin" | "fix";
}

export interface PlacedLocation {
  // Blank where the place had none, which every reader of it already skips.
  name: string;
  latitude: number;
  longitude: number;
  variant: "pin" | "fix";
  bounds: LatLonBounds;
}

/**
 * The places that can actually be drawn, with the extent each one asks for.
 *
 * A place typed in by hand has no position and is skipped - the trip form's
 * part rows say so ("Not on the map") rather than leaving its absence here
 * unexplained.
 * A place the geocoder gave a footprint for is fitted by that footprint, which
 * is what keeps a country from opening at the zoom of its centroid; anything
 * else is fitted as the degenerate box of its own point.
 */
export function placedLocations(
  locations: readonly MappableLocation[],
): PlacedLocation[] {
  const placed: PlacedLocation[] = [];
  for (const location of locations) {
    const { latitude, longitude } = location;
    if (latitude == null || longitude == null) continue;

    const { bbox_south, bbox_north, bbox_west, bbox_east } = location;
    // All four or none: the API validates that, and half a box is not an
    // extent, so the point is the safer reading of a broken one.
    const hasBox =
      bbox_south != null &&
      bbox_north != null &&
      bbox_west != null &&
      bbox_east != null;

    placed.push({
      name: location.name ?? "",
      latitude,
      longitude,
      variant: location.variant ?? "pin",
      bounds: hasBox
        ? {
            south: bbox_south,
            north: bbox_north,
            west: bbox_west,
            east: bbox_east,
          }
        : {
            south: latitude,
            north: latitude,
            west: longitude,
            east: longitude,
          },
    });
  }
  return placed;
}

/**
 * A frame a card gives its map, in CSS pixels, and the band in it - as padding
 * from its top and bottom, `bandIn`'s shape - that the pins are kept to.
 */
export interface CardFrame {
  width: number;
  height: number;
  band: { top: number; bottom: number };
}

// The smallest frame each kind of card gives its map, at a 320 px viewport,
// which is what a picture is fitted for: one picture per record and theme has to
// keep every pin inside the band of every card that shows it, and a wider card
// only shows more of the map around the same middle. The narrowest is a list
// inside a card - the dashboard's, a detail page's - and its width and band are
// measured, not derived: `card-frames.browser.test.tsx` renders each card where
// every list puts it and fails when one is narrower, or its band shorter, than
// these. The height is a card whose lines do not wrap, the 238 px
// `BackdropCardSkeleton` holds less its border, and it decides only how far out
// a place's footprint opens.
//
// The band sits under the credit, 24 px below its 20, and above the details. A
// dive is fitted for the band an outlined dive card leaves, which its depth
// outline clamps to the `FIT_PADDING` floor: fitting every dive for it keeps one
// picture per dive, and a dive's places nearly always open at `MAX_FIT_ZOOM` in
// any band anyway. A trip card carries no outline.
export const DIVE_CARD_FRAME: CardFrame = {
  width: 252,
  height: 236,
  band: { top: 44, bottom: 168 },
};
export const TRIP_CARD_FRAME: CardFrame = {
  width: 252,
  height: 236,
  band: { top: 44, bottom: 128 },
};
