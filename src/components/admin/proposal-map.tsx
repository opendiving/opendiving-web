"use client";

import { useEffect, useState } from "react";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { Minus, Plus } from "lucide-react";
import { useTheme } from "next-themes";

import type { ReviewMarker } from "@/components/admin/proposal-markers";
import { MapCanvas } from "@/components/map/map-canvas";
import { MapCredit } from "@/components/map/map-credit";
import { markerClassName } from "@/components/map/marker";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { useConfig } from "@/contexts/ConfigContext";
import { clampLatitude } from "@/lib/basemap";
import { cn } from "@/lib/utils";

// Close enough to judge a pin against the coast, which the read-only maps' fit is
// deliberately not: matches that differ by metres are what this map is for.
const OPENING_ZOOM = 15;

// Room for the labels, which sit beside their dots and outside what is fitted.
const FIT_PADDING = 56;

const MARKER_CLASSES: Record<ReviewMarker["kind"], string> = {
  proposed: markerClassName("pin"),
  current: markerClassName("fix"),
  match: "h-3 w-3 rounded-full border-2 border-background bg-foreground shadow",
};

// A dot with its label beside it, the dot being what MapLibre centres on the pin.
// The labels alternate sides, so two pins metres apart do not print over each other.
function markerElement(marker: ReviewMarker, index: number): HTMLElement {
  const element = document.createElement("div");
  element.className = cn("relative", MARKER_CLASSES[marker.kind]);
  element.dataset.marker = marker.kind;
  element.title = marker.label;

  const label = document.createElement("span");
  label.textContent = marker.label;
  label.className = cn(
    "absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-background/90 px-1 text-[11px] leading-4 text-foreground shadow",
    marker.kind === "proposed" && "font-semibold",
    index % 2 === 0 ? "left-full ml-1" : "right-full mr-1",
  );
  element.append(label);
  return element;
}

// How far the furthest marker is from the first, as a box centred on the first, so
// the fit's zoom holds them all with the proposed pin at the centre. The difference
// in longitude goes the short way round, a match across the antimeridian being near.
function boundsAround([centre, ...others]: ReviewMarker[]) {
  const reach = others.reduce(
    (furthest, marker) => {
      const across = Math.abs(marker.longitude - centre.longitude);
      return {
        latitude: Math.max(
          furthest.latitude,
          Math.abs(marker.latitude - centre.latitude),
        ),
        longitude: Math.max(furthest.longitude, Math.min(across, 360 - across)),
      };
    },
    { latitude: 0, longitude: 0 },
  );
  return [
    [
      centre.longitude - reach.longitude,
      clampLatitude(centre.latitude - reach.latitude),
    ],
    [
      centre.longitude + reach.longitude,
      clampLatitude(centre.latitude + reach.latitude),
    ],
  ] as [[number, number], [number, number]];
}

export interface ProposalMapProps {
  // At least one, the first being what the map centres on. Hold it stable: a new
  // array moves the camera back.
  markers: ReviewMarker[];
}

// The reviewer's map, the one interactive map that places nothing: `MapPicker` is
// a write-back control, `LocationsMap` is drawn once and not touched. It stays on
// the app's basemap, which has no imagery.
export function ProposalMap({ markers }: ProposalMapProps) {
  const { resolvedTheme } = useTheme();
  const { basemap } = useConfig();
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    if (!map) return;
    const [centre, ...others] = markers;
    const camera =
      others.length > 0
        ? map.cameraForBounds(boundsAround(markers), {
            padding: FIT_PADDING,
            maxZoom: OPENING_ZOOM,
          })
        : undefined;
    map.jumpTo({
      center: [centre.longitude, centre.latitude],
      zoom: camera?.zoom ?? OPENING_ZOOM,
    });
  }, [map, markers]);

  // Added last to first, so the proposed pin and its label lie on top.
  useEffect(() => {
    if (!map) return;
    const added = markers
      .map((marker, index) => ({ marker, index }))
      .reverse()
      .map(({ marker, index }) =>
        new Marker({ element: markerElement(marker, index) })
          .setLngLat([marker.longitude, marker.latitude])
          .addTo(map),
      );
    return () => added.forEach((marker) => marker.remove());
  }, [map, markers]);

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-md border bg-muted sm:h-96">
      {/* The names and distances are in the list beside the map, which is what
          a screen reader is pointed at. */}
      <div
        role="group"
        aria-label={`Map of ${markers.map((marker) => marker.label).join(", ")}`}
        className="absolute inset-0 rounded-[inherit]"
      >
        <MapCanvas
          basemap={basemap}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          interactive
          onMap={setMap}
          unsupported={
            <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              This browser cannot display the map. The pin can still be opened
              on OpenStreetMap, and the matches are listed here.
            </p>
          }
        />
      </div>

      <div className="absolute left-2 top-2 z-10 flex flex-col gap-1">
        <IconTooltip label="Zoom in">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-7 w-7"
            onClick={() => map?.zoomIn()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </IconTooltip>
        <IconTooltip label="Zoom out">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-7 w-7"
            onClick={() => map?.zoomOut()}
          >
            <Minus className="h-4 w-4" />
          </Button>
        </IconTooltip>
      </div>

      <MapCredit className="absolute bottom-0 right-0 z-10" />
    </div>
  );
}

export default ProposalMap;
