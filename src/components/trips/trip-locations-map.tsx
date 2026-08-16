"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  fitBounds,
  LatLonBounds,
  nearestWrappedX,
  parseAttribution,
  project,
  TILE_SIZE,
  tileSource,
  tileUrl,
  visibleTiles,
} from "@/lib/map-tiles";
import { formatTripLocationNames } from "@/lib/trip-locations";

// Breathing room between the outermost place and the edge of the frame, so a
// pin never sits on the border where half of its context is cropped away.
const FIT_PADDING = 24;

/**
 * As much of a trip location as this map needs, which is the position and the
 * name. Loose enough to take both what the API returns and what the form holds
 * while it is being edited.
 */
export interface MappableLocation {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  bbox_south?: number | null;
  bbox_north?: number | null;
  bbox_west?: number | null;
  bbox_east?: number | null;
}

interface PlacedLocation {
  name: string;
  latitude: number;
  longitude: number;
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

export interface TripLocationsMapProps {
  locations: MappableLocation[];
}

/**
 * Where a trip went, drawn once and not touched again.
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
export function TripLocationsMap({ locations }: TripLocationsMapProps) {
  const { resolvedTheme } = useTheme();
  const source = useMemo(() => tileSource(), []);
  const attribution = useMemo(
    () => parseAttribution(source.attribution),
    [source.attribution],
  );
  const template = resolvedTheme === "dark" ? source.dark : source.light;

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
          left: nearestWrappedX(point.x, center.x, view.zoom) - origin.x,
          top: point.y - origin.y,
        };
      })
    : [];

  // Nothing with a position is nothing to draw, and an empty grey box is worse
  // than no map at all. Callers may still gate on the same thing to avoid the
  // dynamic import; this is so they do not have to.
  if (placed.length === 0) return null;

  // Every location has a name, but nothing stops one being blank, and "Map of
  // " reads as a bug to anyone hearing it.
  const names = formatTripLocationNames(placed);

  return (
    <div className="relative h-40 w-full overflow-hidden rounded-md border bg-muted sm:h-48">
      {/* The label sits on the grid rather than on the frame around it, so the
          attribution's links stay outside the image and reachable: a link
          inside `role="img"` is dropped from the accessibility tree, and a
          licence credit nobody can follow is not much of a credit. */}
      <div
        ref={measureSurface}
        role="img"
        aria-label={names ? `Map of ${names}` : "Map of the trip's locations"}
        className="absolute inset-0"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {tiles.map((tile) => (
            /* Plain `<img>`, not `next/image`: third-party tiles addressed by
               z/x/y, so there is nothing for the optimizer to do but proxy
               them. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={tile.key}
              src={tileUrl(template, tile.x, tile.y, tile.zoom)}
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
                  both themes. */}
              <div className="h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-coral shadow" />
            </div>
          ))}
        </div>
      </div>

      {/* A licence condition of the tiles, so it is rendered over them.
          `target="_blank"` is not decoration: this map appears inside a dialog
          holding a half-filled form, and navigating away in the same tab would
          throw it away. */}
      <div className="absolute bottom-0 right-0 bg-background/80 px-1 text-[10px] leading-4 text-muted-foreground">
        {attribution.map((part, index) =>
          part.href ? (
            <a
              key={index}
              href={part.href}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {part.text}
            </a>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </div>
    </div>
  );
}

export default TripLocationsMap;
