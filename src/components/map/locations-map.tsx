"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";

import {
  MAX_FIT_ZOOM,
  MIN_ZOOM,
  unionBounds,
  WORLD_CENTER,
} from "@/lib/basemap";
import { useConfig } from "@/contexts/ConfigContext";
import { MapCredit } from "@/components/map/map-credit";
import { mapLabel } from "@/components/map/map-label";
import { MapCanvas } from "@/components/map/map-canvas";
import { markerClassName } from "@/components/map/marker";
import {
  bandIn,
  FIT_PADDING,
  placedLocations,
  type MappableLocation,
} from "@/lib/map-frame";

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
   * it down the dialog mid-edit. Off by default, because elsewhere the map
   * answers "where is this?", and an empty world is a worse answer than no map
   * at all.
   */
  showWhenEmpty?: boolean;
}

/**
 * Where a trip goes, live beside the form that fills it in: places drawn once
 * and not touched again. The cards and the detail pages' heads compose their
 * maps from the server's tiles instead (`MapBackdrop`).
 *
 * Deliberately not `MapPicker`: nearly all of that component's size is the
 * write-back problem - telling a position it emitted apart from one the diver
 * typed - and gesture handling for placing a pin. This map emits nothing, so
 * none of that exists here by construction, and it is built `interactive: false`
 * to say so to the renderer as well.
 */
export function LocationsMap({
  locations,
  subject,
  showWhenEmpty,
}: LocationsMapProps) {
  const { resolvedTheme } = useTheme();
  // From the instance's runtime configuration, so a published image can be
  // pointed at another basemap without a rebuild (`lib/runtime-config.ts`).
  const { basemap } = useConfig();

  const [map, setMap] = useState<MapLibreMap | null>(null);

  // What the places actually are, held stable across renders that did not change
  // them. Every effect below either moves the camera or rebuilds the markers, and
  // most callers hand this component a freshly built array on each of their own
  // renders - so depending on that array's identity would refit the map every
  // time the page around it re-rendered, which is a visible jump rather than a
  // wasted cycle.
  //
  // The dependency is the serialized *values* rather than the array, and the
  // round trip through JSON is what makes that honest: the memo really does
  // depend on nothing but `signature`, so there is no rule to suppress here.
  const signature = JSON.stringify(
    locations.map((location) => ({
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      variant: location.variant,
      bbox_south: location.bbox_south,
      bbox_north: location.bbox_north,
      bbox_west: location.bbox_west,
      bbox_east: location.bbox_east,
    })),
  );
  const placed = useMemo(
    () => placedLocations(JSON.parse(signature) as MappableLocation[]),
    [signature],
  );

  // The fit. `unionBounds` is what keeps a trip to Fiji and Samoa six degrees
  // wide rather than 354 - MapLibre's own `LngLatBounds.extend()` unions raw
  // longitudes with `Math.min`/`Math.max`, and its repair of a finished box
  // cannot undo a union built the long way round. The camera arithmetic from
  // there is MapLibre's, including the `maxZoom` cap that opens a lone place
  // where the surrounding coast is recognisable rather than at street level.
  useEffect(() => {
    if (!map) return;
    const bounds = unionBounds(placed.map((location) => location.bounds));

    const fit = () => {
      if (!bounds) {
        // Nothing placed, which only happens under `showWhenEmpty`: the whole
        // world, centred a little north of the equator because that is where
        // the land - and most of the world's diving - is.
        map.jumpTo({
          center: [WORLD_CENTER.longitude, WORLD_CENTER.latitude],
          zoom: MIN_ZOOM,
        });
        return;
      }
      // `bandIn`'s floor, so a frame too short for the padding still fits.
      const container = map.getContainer();
      map.fitBounds(
        [
          [bounds.west, bounds.south],
          [bounds.east, bounds.north],
        ],
        {
          padding: {
            ...bandIn(container.clientHeight, 0, 0),
            left: FIT_PADDING,
            right: FIT_PADDING,
          },
          maxZoom: MAX_FIT_ZOOM,
          // This map is drawn once and not touched again; an animation on
          // first paint is a map that arrives already moving.
          animate: false,
        },
      );
    };

    fit();

    // **And again whenever the frame changes size**, which is not something
    // MapLibre does for us. Its `trackResize` calls `Map.resize()`, and that
    // recomputes the projection for the new box while keeping centre and zoom
    // exactly where they were - so a frame that *narrows* after the first fit,
    // on a rotation to portrait or a `sm:` breakpoint or a dialog re-laying
    // out, keeps a camera fitted to the wider one and pushes the outermost pins
    // outside it. Refitting is what the hand-rolled version did implicitly, by
    // recomputing from a measured size on every render; this is the same
    // behaviour hung on the event MapLibre does emit.
    map.on("resize", fit);
    return () => {
      map.off("resize", fit);
    };
  }, [map, placed]);

  // Markers are MapLibre's rather than absolutely positioned children, which is
  // what hands it the job of drawing a place at 178E in the copy of the world
  // the view is actually showing when it has been fitted across the antimeridian
  // to reach one at 172W.
  useEffect(() => {
    if (!map) return;
    const markers = placed.map((location) => {
      const element = document.createElement("div");
      element.className = markerClassName(location.variant);
      // Which marker is which, on hover. Two same-shaped rings a few hundred
      // metres apart are one blob at this zoom, so "Entry" or "Exit" is worth an
      // attribute even though the names are also in the surface's own
      // aria-label.
      if (location.name.trim()) element.title = location.name;
      // How the tests count and tell them apart, now that the placement is a
      // transform MapLibre writes rather than one this component does.
      element.dataset.marker = location.variant;
      return new Marker({ element })
        .setLngLat([location.longitude, location.latitude])
        .addTo(map);
    });
    return () => markers.forEach((marker) => marker.remove());
  }, [map, placed]);

  // Nothing with a position is nothing to draw, and an empty grey box is worse
  // than no map at all - unless the caller asked for one anyway. Callers may
  // still gate on the same thing to avoid the dynamic import; this is so they
  // do not have to.
  if (placed.length === 0 && !showWhenEmpty) return null;

  const label = mapLabel(placed, subject);

  const unsupported = (
    <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
      This browser cannot display the map.
    </p>
  );

  return (
    <div className="relative h-40 w-full overflow-hidden rounded-md border bg-muted sm:h-48">
      {/* The label sits on the map rather than on the frame around it, so the
          attribution's links stay outside the image and reachable: a link
          inside `role="img"` is dropped from the accessibility tree, and a
          licence credit nobody can follow is not much of a credit. */}
      {/* `rounded-[inherit]` hands the frame's corners down to `MapCanvas`,
          which is what clips the map to them. */}
      <div
        role="img"
        aria-label={label}
        className="absolute inset-0 rounded-[inherit]"
      >
        <MapCanvas
          basemap={basemap}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          onMap={setMap}
          unsupported={unsupported}
        />
      </div>

      {/* A licence condition of the basemap, so it is rendered over it.
          `target="_blank"` is not decoration: this map appears inside dialogs
          holding a half-filled form, and navigating away in the same tab would
          throw it away. */}
      <MapCredit className="absolute bottom-0 right-0 z-10" />
    </div>
  );
}

export default LocationsMap;
