"use client";

import { useCallback, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  fitBounds,
  LatLonBounds,
  nearestWrappedX,
  project,
  TILE_SIZE,
  needsDarkFilter,
  tileSrcSet,
  tileUrl,
  visibleTiles,
} from "@/lib/map-tiles";
import { useConfig } from "@/contexts/ConfigContext";
import { formatTripLocationNames } from "@/lib/trip-locations";
import { Attribution } from "@/components/attribution";
import { cn } from "@/lib/utils";

// Breathing room between the outermost place and the edge of the frame, so a
// pin never sits on the border where half of its context is cropped away.
const FIT_PADDING = 24;

/**
 * As much of a place as this map needs, which is the position and the name.
 * Loose enough to take a trip location - both what the API returns and what the
 * form holds while it is being edited - as well as a dive site, which is the
 * same two fields under the same names.
 */
export interface MappableLocation {
  name: string;
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
   * this component knows about positions and names, and one optional styling
   * field is what keeps it that way.
   */
  variant?: "pin" | "fix";
}

interface PlacedLocation {
  name: string;
  latitude: number;
  longitude: number;
  variant: "pin" | "fix";
  bounds: LatLonBounds;
}

/**
 * The places that can actually be drawn, with the extent each one asks for.
 *
 * A place typed in by hand has no position and is skipped - the picker's rows
 * say so ("not on the map") rather than leaving its absence here unexplained.
 * A place the geocoder gave a footprint for is fitted by that footprint, which
 * is what keeps a country from opening at the zoom of its centroid; anything
 * else is fitted as the degenerate box of its own point.
 */
function placedLocations(locations: MappableLocation[]): PlacedLocation[] {
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
      name: location.name,
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

export interface LocationsMapProps {
  locations: MappableLocation[];
  /**
   * What the map is of, for the label a screen reader reads when the places
   * turn out to have no usable names between them. Never seen otherwise - the
   * names themselves are the label whenever there are any.
   *
   * Required despite having an obvious default, because the path that reads it
   * has no visual tell: a caller who left it off would get a plausible but
   * wrong label that no screenshot and no test of theirs would catch.
   */
  subject: string;
  /**
   * Draw the frame even when nothing given has a position, showing the whole
   * world - the same view `MapPicker` opens on for a site with no pin yet.
   *
   * For a form that shows this map beside the field that fills it, where a
   * frame appearing only once the first place is picked shoves everything below
   * it down the dialog mid-edit. Off by default, because everywhere else the
   * map answers "where is this?", and an empty world is a worse answer than no
   * map at all.
   */
  showWhenEmpty?: boolean;
}

/**
 * Where a trip went, or where a dive site is: places drawn once and not touched
 * again.
 *
 * Deliberately not `MapPicker`: nearly all of that component's size is the
 * write-back problem - telling a position it emitted apart from one the diver
 * typed - and gesture handling for placing a pin. This map emits nothing, so
 * none of that exists here by construction. What is left is a tile grid, a pin
 * per place, and the fit, and the fit is `lib/map-tiles.ts`'s job.
 *
 * Whole zoom levels only, for the same reason: fractional zoom exists so a
 * pinch glides, and there is nothing to pinch. Tiles are drawn at their own
 * level and never scaled, which is also the sharpest they can be.
 */
export function LocationsMap({
  locations,
  subject,
  showWhenEmpty,
}: LocationsMapProps) {
  const { resolvedTheme } = useTheme();
  // From the instance's runtime configuration, so a published image can be pointed
  // at another tile server without a rebuild (`lib/runtime-config.ts`).
  const { tiles: source } = useConfig();
  const template = resolvedTheme === "dark" ? source.dark : source.light;
  // OpenStreetMap has no dark tiles, so the dark theme's are made here. Scoped
  // to the tile layer: inverting the pins with it would turn the coral markers
  // teal, and they are the one colour held constant across both themes.
  const darkFilter = resolvedTheme === "dark" && needsDarkFilter(source);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  // Measured rather than assumed: the width is whatever column this sits in,
  // and the height comes from the classes below, which would otherwise have to
  // be kept in step with a number here.
  //
  // A callback ref rather than a ref plus a mount-only effect, because the
  // surface is not always there at mount: a map rendered with nothing to draw
  // returns null, and an effect that found no element then would never look
  // again - so locations arriving later would render an empty frame, measured
  // at 0x0 forever. This runs whenever the element itself appears or goes.
  const measureSurface = useCallback((surface: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (!surface) {
      observerRef.current = null;
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(surface);
    observerRef.current = observer;
  }, []);

  const placed = placedLocations(locations);
  const view = fitBounds(
    placed.map((location) => location.bounds),
    size.width,
    size.height,
    FIT_PADDING,
  );

  const center = project(view.center, view.zoom);
  const origin = {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  };
  const measured = size.width > 0 && size.height > 0;

  const tiles = measured
    ? visibleTiles(center, size.width, size.height, view.zoom)
    : [];

  // `nearestWrappedX` is what keeps a place at 178°E on screen when the view
  // has been fitted across the antimeridian to reach one at 172°W.
  const markers = measured
    ? placed.map((location) => {
        const point = project(location, view.zoom);
        return {
          name: location.name,
          variant: location.variant,
          left: nearestWrappedX(point.x, center.x, view.zoom) - origin.x,
          top: point.y - origin.y,
        };
      })
    : [];

  // Nothing with a position is nothing to draw, and an empty grey box is worse
  // than no map at all - unless the caller asked for one anyway. Callers may
  // still gate on the same thing to avoid the dynamic import; this is so they
  // do not have to.
  if (placed.length === 0 && !showWhenEmpty) return null;

  // Every location has a name, but nothing stops one being blank, and "Map of
  // " reads as a bug to anyone hearing it - hence the caller's `subject` as the
  // fallback. `formatTripLocationNames` is the same joining rule the trip's own
  // header uses, and it drops the blanks.
  const names = formatTripLocationNames(placed);
  // The empty frame says what it is rather than borrowing the label of the
  // places it doesn't have: "Map of the trip's locations" over a blank world is
  // wrong in exactly the place nobody looking at the screen can see it.
  const label =
    placed.length > 0
      ? `Map of ${names ?? subject}`
      : `Map of the world, awaiting ${subject}`;

  return (
    <div className="relative h-40 w-full overflow-hidden rounded-md border bg-muted sm:h-48">
      {/* The label sits on the grid rather than on the frame around it, so the
          attribution's links stay outside the image and reachable: a link
          inside `role="img"` is dropped from the accessibility tree, and a
          licence credit nobody can follow is not much of a credit. */}
      <div
        ref={measureSurface}
        role="img"
        aria-label={label}
        className="absolute inset-0"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            data-testid="tile-layer"
            className={cn(
              "absolute inset-0",
              darkFilter && "invert hue-rotate-180",
            )}
          >
            {tiles.map((tile) => (
              /* Plain `<img>`, not `next/image`: third-party tiles addressed by
               z/x/y, so there is nothing for the optimizer to do but proxy
               them. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={tile.key}
                src={tileUrl(template, tile.x, tile.y, tile.zoom)}
                srcSet={tileSrcSet(template, tile.x, tile.y, tile.zoom)}
                alt=""
                width={TILE_SIZE}
                height={TILE_SIZE}
                draggable={false}
                className="absolute left-0 top-0 max-w-none"
                style={{
                  transform: `translate3d(${tile.left}px, ${tile.top}px, 0)`,
                }}
              />
            ))}
          </div>

          {markers.map((marker, index) => (
            <div
              key={`${marker.name}-${index}`}
              className="absolute left-0 top-0"
              style={{
                transform: `translate3d(${marker.left}px, ${marker.top}px, 0)`,
              }}
            >
              {/* Pulled back by half its own size so the dot is centred on the
                  place rather than hanging below and to the right of it.

                  `bg-coral`, not `bg-primary`: primary is near-black in light
                  and mid-grey in dark, which is invisible against Dark Matter's
                  near-black tiles. Coral is the one accent held constant across
                  both themes.

                  A fix inverts the same two colours rather than changing size or
                  hue: same coral, same 12px, so the pair reads as one legend
                  where a second colour would read as a second meaning. The tinted
                  rather than transparent centre is what keeps the ring a ring
                  over a busy coastline in either theme. */}
              <div
                // Which marker is which, on hover. Two same-shaped rings a few
                // hundred metres apart are one blob at this zoom, so "Entry" or
                // "Exit" is worth an attribute even though the names are also
                // in the surface's own aria-label.
                //
                // `pointer-events-auto` on the marker alone, against the grid's
                // `pointer-events-none`: without it the title has nothing to
                // fire on and is dead markup. Hover is all it buys - there are
                // no handlers here, so the map still emits nothing.
                title={marker.name || undefined}
                className={cn(
                  "pointer-events-auto h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow",
                  marker.variant === "fix"
                    ? "border-coral bg-background/80"
                    : "border-background bg-coral",
                )}
              />
            </div>
          ))}
        </div>
      </div>

      {/* A licence condition of the tiles, so it is rendered over them.
          `target="_blank"` is not decoration: this map appears inside dialogs
          holding a half-filled form, and navigating away in the same tab would
          throw it away. */}
      <div className="absolute bottom-0 right-0 bg-background/80 px-1 text-[10px] leading-4 text-muted-foreground">
        <Attribution value={source.attribution} />
      </div>
    </div>
  );
}

export default LocationsMap;
