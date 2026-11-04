// What every map this app draws has to agree on: how a place becomes an extent,
// the band of a frame its pins are kept to, and the canvas a page head's map is
// drawn across.

import type { LatLonBounds } from "@/lib/basemap";

// How wide a detail page's hero draws its map, in CSS pixels: a canvas this wide
// centred in the frame, which a window wider than it shows dissolving into the
// page at its sides, and a narrower one shows the middle of. The header's
// `max-w-6xl` column, so the map spans the menu bar above it.
export const HERO_CANVAS_WIDTH = 1152;

// How far in from each side a hero's canvas dissolves into the page. A quarter
// of it: wide enough that the eye finds no edge, and leaves the middle half for
// the pins.
export const SIDE_FADE_WIDTH = HERO_CANVAS_WIDTH / 4;

// Breathing room between the outermost place and the edge of the frame, so a
// pin never sits on the border where half of its context is cropped away.
export const FIT_PADDING = 24;

// Where the places have to land, as padding from a frame's top and bottom:
// clear of whatever the caller covers the foot with, and of a backdrop's credit
// over the top edge. Never so small that nothing fits: a fit then has no room
// and gives up.
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
 * The part of a frame its map is drawn across, as an offset and a width, and
 * how far in from the frame's sides its places are kept.
 *
 * A card's map is the whole frame, its places `FIT_PADDING` in. A hero's is a
 * canvas `HERO_CANVAS_WIDTH` wide centred in the frame - wider than a phone's
 * frame, which shows its middle, and narrower than a desktop window's - with
 * its places kept out of the side fades as well as in from the frame's edges.
 */
export function mapCanvas(
  frameWidth: number,
  hero: boolean,
): { left: number; width: number; inset: number } {
  if (!hero) return { left: 0, width: frameWidth, inset: FIT_PADDING };
  const left = (frameWidth - HERO_CANVAS_WIDTH) / 2;
  return {
    left,
    width: HERO_CANVAS_WIDTH,
    inset: Math.max(FIT_PADDING, left + SIDE_FADE_WIDTH),
  };
}

/**
 * As much of a place as a map needs: its position, its footprint where it has
 * one, and a name for a pointer and a screen reader. Loose enough to take a trip
 * location - both what the API returns and what the form holds while it is
 * being edited - as well as a dive site, which carries the same fields under the
 * same names.
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

// A geocoder sends a place across the antimeridian as a box nearly or wholly
// round the world: Fiji at -180 to 180, New Zealand 358 degrees wide. From this
// wide up, the box says nothing about longitude. The iOS app holds the same
// threshold, so a place frames alike on both.
const WORLD_BOX_SPAN = 350;

/**
 * What a place's box asks a map to fit. A box that circles the world keeps its
 * south and north and takes a width equal to that height, centred on the place's
 * own longitude, so a place really that wide shows around its point and not
 * whole. The extent may pass 180, which `unionBounds` takes. Its span is
 * `unionBounds`' own, repeated here because the renderer's bundle hashes
 * `basemap.ts` whole and any edit there has every stored tile drawn again.
 */
function boxExtent(box: LatLonBounds, longitude: number): LatLonBounds {
  const signed = box.east - box.west;
  const span = signed >= 0 ? Math.min(signed, 360) : signed + 360;
  if (span < WORLD_BOX_SPAN) return box;

  // Absolute because form state reaches here unvalidated, as in `unionBounds`.
  const half = Math.abs(box.north - box.south) / 2;
  return {
    south: box.south,
    north: box.north,
    west: longitude - half,
    east: longitude + half,
  };
}

/**
 * The places that can actually be drawn, with the extent each one asks for.
 *
 * A place typed in by hand has no position and is skipped - the trip form's
 * part rows say so ("Not on the map") rather than leaving its absence here
 * unexplained.
 * A place the geocoder gave a footprint for is fitted by that footprint, which
 * is what keeps a country from opening at the zoom of its centroid; anything
 * else is fitted as the degenerate box of its own point. The exception is a box
 * that circles the world, which `boxExtent` reads around the place's point.
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
        ? boxExtent(
            {
              south: bbox_south,
              north: bbox_north,
              west: bbox_west,
              east: bbox_east,
            },
            longitude,
          )
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
