"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Minus, Plus } from "lucide-react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapLayerMouseEvent,
  MapLibreEvent,
} from "maplibre-gl";

import { MAX_ZOOM, MIN_ZOOM, WORLD_CENTER, type LatLon } from "@/lib/basemap";
import type {
  CommonsDiveSitePoints,
  DiveSitePoint,
} from "@/lib/api/dive-sites";
import { FINDER_POINT_ZOOM, type FinderTarget } from "@/lib/site-finder-camera";
import { useConfig } from "@/contexts/ConfigContext";
import { MapCanvas } from "@/components/map/map-canvas";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import {
  commonsCollection,
  pointOf,
  yoursCollection,
  type FinderMapPoint,
  type FinderView,
  type PointCollection,
} from "./site-finder-points";

export interface SiteFinderMapProps {
  commons: CommonsDiveSitePoints | null;
  yours: DiveSitePoint[] | null;
  /** Under *Your sites*: the Commons layer hidden, the diver's alone drawn. */
  yoursOnly: boolean;
  /** A move the finder asks for, applied once per `id`. */
  target: { id: number; target: FinderTarget } | null;
  /** The row the diver is pointing at in the list. */
  highlight: LatLon | null;
  /**
   * Every settled camera. `byDiver` is whether the diver moved it - a drag, a
   * wheel, a zoom button, a cluster opened - rather than the finder.
   */
  onViewChange: (view: FinderView, byDiver: boolean) => void;
  onPointPick: (point: FinderMapPoint) => void;
  /** The instance, for a test that reads what was drawn. */
  onMap?: (map: MapLibreMap | null) => void;
}

const COMMONS = "finder-commons";
const YOURS = "finder-yours";
const HIGHLIGHT = "finder-highlight";

// Teal for the shared records and coral for the diver's: the two brand
// accents, each its named CSS colour and the same in either theme.
const COLOURS = { [COMMONS]: "#008080", [YOURS]: "#FF7F50" } as const;

// Past this the points of a source are drawn one by one, so two sites a few
// hundred metres apart can be told apart and touched.
const CLUSTER_MAX_ZOOM = 12;
// A place's box is fitted no closer than this: a reef's footprint is not a view.
const MAX_TARGET_ZOOM = 13;
const FIT_PADDING = 24;

const empty: PointCollection = { type: "FeatureCollection", features: [] };

const clusterLayer = (source: string) => `${source}-clusters`;
const countLayer = (source: string) => `${source}-counts`;
const pointLayer = (source: string) => `${source}-points`;

// The font the basemap already letters with, for the clusters' counts. A style
// with no glyphs, or none named, gets circles sized by count and no figure: a
// font the glyph server does not hold is an error per tile, not a fallback.
function countFont(map: MapLibreMap): string[] | null {
  const style = map.getStyle();
  if (!style?.glyphs) return null;
  for (const layer of style.layers ?? []) {
    if (layer.type !== "symbol") continue;
    const font = layer.layout?.["text-font"];
    if (Array.isArray(font) && font.every((f) => typeof f === "string")) {
      return font as string[];
    }
  }
  return null;
}

function addPoints(map: MapLibreMap, source: string, data: PointCollection) {
  const colour = COLOURS[source as keyof typeof COLOURS];
  map.addSource(source, {
    type: "geojson",
    data,
    cluster: true,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    clusterRadius: 50,
  });
  map.addLayer({
    id: clusterLayer(source),
    type: "circle",
    source,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": colour,
      "circle-opacity": 0.85,
      "circle-radius": ["step", ["get", "point_count"], 13, 10, 17, 100, 22],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });
  const font = countFont(map);
  if (font) {
    map.addLayer({
      id: countLayer(source),
      type: "symbol",
      source,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": font,
        "text-size": 12,
        "text-allow-overlap": true,
      },
      paint: { "text-color": "#ffffff" },
    });
  }
  map.addLayer({
    id: pointLayer(source),
    type: "circle",
    source,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": colour,
      "circle-radius": 6,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });
}

function setVisible(map: MapLibreMap, source: string, visible: boolean) {
  for (const layer of [
    clusterLayer(source),
    countLayer(source),
    pointLayer(source),
  ]) {
    if (map.getLayer(layer)) {
      map.setLayoutProperty(layer, "visibility", visible ? "visible" : "none");
    }
  }
}

function highlightData(point: LatLon | null): PointCollection {
  if (!point) return empty;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [point.longitude, point.latitude],
        },
        properties: { uuid: "", name: "", source: null },
      },
    ],
  };
}

const viewOf = (map: MapLibreMap): FinderView => {
  const center = map.getCenter().wrap();
  const bounds = map.getBounds();
  return {
    center: { latitude: center.lat, longitude: center.lng },
    bounds: {
      south: bounds.getSouth(),
      north: bounds.getNorth(),
      west: bounds.getWest(),
      east: bounds.getEast(),
    },
  };
};

/**
 * The finder's map: every Commons record and every one of the diver's sites as
 * points, clustered by MapLibre, over the instance's basemap. It owns no list
 * and sends no request; it reports where it is and what was touched.
 */
export function SiteFinderMap({
  commons,
  yours,
  yoursOnly,
  target,
  highlight,
  onViewChange,
  onPointPick,
  onMap,
}: SiteFinderMapProps) {
  const { resolvedTheme } = useTheme();
  const { basemap } = useConfig();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);

  const yoursData = useMemo(() => yoursCollection(yours), [yours]);
  const commonsData = useMemo(
    () =>
      commonsCollection(
        commons,
        new Set((yours ?? []).map((point) => point[2])),
      ),
    [commons, yours],
  );

  // What the next style load installs, read there rather than closed over: a
  // theme swap drops every source this map added, and has to put back the
  // current data, not the data the listener was registered with.
  const latest = useRef({ commonsData, yoursData, yoursOnly, highlight });
  const callbacks = useRef({ onViewChange, onPointPick, commons, yours });
  useEffect(() => {
    latest.current = { commonsData, yoursData, yoursOnly, highlight };
    callbacks.current = { onViewChange, onPointPick, commons, yours };
  });

  // A move this map makes for the finder, which is not the diver's.
  const applying = useRef(false);
  // A move this map makes for the diver - a zoom button, a cluster opened -
  // which carries no input event of its own.
  const forDiver = useRef(false);

  const attach = (instance: MapLibreMap | null) => {
    setMap(instance);
    onMap?.(instance);
  };

  // Where the camera last settled. A route the diver left stays mounted and
  // gets a new map on the way back, which opens where the old one was rather
  // than on the world the finder no longer rests on.
  const camera = useRef<{ center: [number, number]; zoom: number } | null>(
    null,
  );

  useEffect(() => {
    if (!map) return;
    map.jumpTo(
      camera.current ?? {
        center: [WORLD_CENTER.longitude, WORLD_CENTER.latitude],
        zoom: MIN_ZOOM,
      },
    );

    const install = () => {
      const { commonsData, yoursData, yoursOnly, highlight } = latest.current;
      if (!map.getSource(COMMONS)) addPoints(map, COMMONS, commonsData);
      if (!map.getSource(YOURS)) addPoints(map, YOURS, yoursData);
      if (!map.getSource(HIGHLIGHT)) {
        map.addSource(HIGHLIGHT, {
          type: "geojson",
          data: highlightData(highlight),
        });
        map.addLayer({
          id: HIGHLIGHT,
          type: "circle",
          source: HIGHLIGHT,
          paint: {
            "circle-radius": 11,
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#FF7F50",
            "circle-stroke-width": 3,
          },
        });
      }
      setVisible(map, COMMONS, !yoursOnly);
    };

    const moved = (
      event: MapLibreEvent<MouseEvent | TouchEvent | WheelEvent | undefined>,
    ) => {
      const byDiver =
        !applying.current && (!!event.originalEvent || forDiver.current);
      forDiver.current = false;
      const { lng, lat } = map.getCenter();
      camera.current = { center: [lng, lat], zoom: map.getZoom() };
      callbacks.current.onViewChange(viewOf(map), byDiver);
    };
    const zoomed = () => setZoom(map.getZoom());

    const openCluster = async (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const source = feature?.source;
      const clusterId = feature?.properties?.cluster_id;
      if (!feature || !source || typeof clusterId !== "number") return;
      const zoomTo = await (
        map.getSource(source) as GeoJSONSource
      ).getClusterExpansionZoom(clusterId);
      const geometry = feature.geometry;
      if (geometry.type !== "Point") return;
      forDiver.current = true;
      map.easeTo({
        center: geometry.coordinates as [number, number],
        zoom: zoomTo,
      });
    };
    const pick = (event: MapLayerMouseEvent) => {
      const feature: MapGeoJSONFeature | undefined = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const { commons, yours, onPointPick } = callbacks.current;
      const point = pointOf(
        feature.properties ?? {},
        feature.geometry.coordinates as [number, number],
        commons,
        yours,
      );
      if (point) onPointPick(point);
    };
    const pointer = () => (map.getCanvas().style.cursor = "pointer");
    const plain = () => (map.getCanvas().style.cursor = "");

    // Both events, because a theme swap is a style *diff* when the basemap is a
    // document - which drops every source added here without a `style.load` -
    // and a whole reload when it is a URL. `install` adds only what is missing.
    const reinstall = () => {
      if (map.isStyleLoaded()) install();
    };
    map.on("style.load", install);
    map.on("styledata", reinstall);
    reinstall();
    map.on("moveend", moved);
    map.on("zoom", zoomed);
    const clickable = [COMMONS, YOURS].flatMap((source) => [
      [clusterLayer(source), openCluster] as const,
      [pointLayer(source), pick] as const,
    ]);
    for (const [layer, handler] of clickable) {
      map.on("click", layer, handler);
      map.on("mouseenter", layer, pointer);
      map.on("mouseleave", layer, plain);
    }
    return () => {
      map.off("style.load", install);
      map.off("styledata", reinstall);
      map.off("moveend", moved);
      map.off("zoom", zoomed);
      for (const [layer, handler] of clickable) {
        map.off("click", layer, handler);
        map.off("mouseenter", layer, pointer);
        map.off("mouseleave", layer, plain);
      }
    };
  }, [map]);

  useEffect(() => {
    (map?.getSource(COMMONS) as GeoJSONSource | undefined)?.setData(
      commonsData,
    );
  }, [map, commonsData]);
  useEffect(() => {
    (map?.getSource(YOURS) as GeoJSONSource | undefined)?.setData(yoursData);
  }, [map, yoursData]);
  useEffect(() => {
    (map?.getSource(HIGHLIGHT) as GeoJSONSource | undefined)?.setData(
      highlightData(highlight),
    );
  }, [map, highlight]);
  useEffect(() => {
    if (map) setVisible(map, COMMONS, !yoursOnly);
  }, [map, yoursOnly]);

  // Applied without animation, so the camera is where the finder said by the
  // time the list's request carries it, and the move it reports is the finder's.
  const applied = useRef<number | null>(null);
  useEffect(() => {
    if (!map || !target || applied.current === target.id) return;
    applied.current = target.id;
    const { target: to } = target;
    applying.current = true;
    try {
      if (to.kind === "point") {
        map.jumpTo({
          center: [to.longitude, to.latitude],
          zoom: to.zoom ?? FINDER_POINT_ZOOM,
        });
      } else {
        map.fitBounds(
          [
            [to.west, to.south],
            [to.west <= to.east ? to.east : to.east + 360, to.north],
          ],
          { padding: FIT_PADDING, maxZoom: MAX_TARGET_ZOOM, animate: false },
        );
      }
    } finally {
      applying.current = false;
    }
  }, [map, target]);

  const zoomBy = (delta: number) => {
    if (!map) return;
    forDiver.current = true;
    map.easeTo({ zoom: map.getZoom() + delta });
  };

  return (
    <>
      <MapCanvas
        basemap={basemap}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        interactive
        cooperative={false}
        onMap={attach}
        unsupported={
          <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            This browser cannot display the map. The search still finds sites
            and places by name.
          </p>
        }
      />
      <div className="absolute left-2 top-2 z-10 flex flex-col gap-1">
        <IconTooltip label="Zoom in">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            disabled={!map || zoom >= MAX_ZOOM}
            onClick={() => zoomBy(1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </IconTooltip>
        <IconTooltip label="Zoom out">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            disabled={!map || zoom <= MIN_ZOOM}
            onClick={() => zoomBy(-1)}
          >
            <Minus className="h-4 w-4" />
          </Button>
        </IconTooltip>
      </div>
    </>
  );
}

export default SiteFinderMap;
