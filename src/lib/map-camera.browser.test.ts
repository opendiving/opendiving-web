import { afterEach, describe, expect, it } from "vitest";
import {
  Map as MapLibreMap,
  MercatorCoordinate,
  setWorkerUrl,
  type LngLatBoundsLike,
} from "maplibre-gl";

import {
  MAX_FIT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  unionBounds,
  wrapLongitude,
  type LatLonBounds,
} from "@/lib/basemap";
import {
  bandIn,
  FIT_PADDING,
  mapCanvas,
  placedLocations,
  type MappableLocation,
} from "@/lib/map-frame";
import { frameCamera, type Camera, type MapFrame } from "./map-camera";

// The web's fit against GL JS's own `cameraForBounds`, given the paddings a
// live backdrop's fit would pass it for the same frame: the extents over the
// frame, the pins over the band, both kept in from the sides by the frame's
// inset, and the pins' middle as the centre. A real browser because GL JS needs
// WebGL2 to build a map at all.

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const EMPTY_STYLE = { version: 8 as const, sources: {}, layers: [] };

const corners = (bounds: LatLonBounds): LngLatBoundsLike => [
  [bounds.west, bounds.south],
  [bounds.east, bounds.north],
];

let map: MapLibreMap | null = null;

afterEach(() => {
  map?.remove();
  map = null;
  document.body.replaceChildren();
});

// GL JS's camera for `locations` in a map the size of `frame`.
function expectedCamera(
  locations: MappableLocation[],
  frame: MapFrame,
): Camera {
  const container = document.createElement("div");
  container.style.width = `${frame.width}px`;
  container.style.height = `${frame.height}px`;
  document.body.append(container);
  map = new MapLibreMap({
    container,
    style: EMPTY_STYLE,
    interactive: false,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    attributionControl: false,
  });

  const placed = placedLocations(locations);
  const bounds = unionBounds(placed.map((location) => location.bounds))!;
  const pins = unionBounds(
    placed.map(({ latitude, longitude }) => ({
      south: latitude,
      north: latitude,
      west: longitude,
      east: longitude,
    })),
  )!;
  const sides = { left: frame.inset, right: frame.inset };
  const zoom = Math.min(
    map.cameraForBounds(corners(bounds), {
      padding: { ...sides, top: FIT_PADDING, bottom: FIT_PADDING },
      maxZoom: MAX_FIT_ZOOM,
    })?.zoom ?? MAX_FIT_ZOOM,
    map.cameraForBounds(corners(pins), {
      padding: { ...sides, ...frame.band },
      maxZoom: MAX_FIT_ZOOM,
    })?.zoom ?? MAX_FIT_ZOOM,
  );
  const southWest = MercatorCoordinate.fromLngLat([pins.west, pins.south]);
  const northEast = MercatorCoordinate.fromLngLat([pins.east, pins.north]);
  const center = new MercatorCoordinate(
    (southWest.x + northEast.x) / 2,
    (southWest.y + northEast.y) / 2,
  ).toLngLat();
  return {
    center: { latitude: center.lat, longitude: wrapLongitude(center.lng) },
    zoom,
  };
}

// A card's frame, as `MapBackdrop` measures one: a credit 20 px tall over its
// top edge, and the details over its foot.
const card = (width: number, coveredBottom: number): MapFrame => ({
  width,
  height: 236,
  band: bandIn(236, 20, coveredBottom),
  inset: mapCanvas(width, false).inset,
});

// A hero's, under its top row and over its details, at a window's width.
const hero = (width: number): MapFrame => ({
  width,
  height: 320,
  band: bandIn(320, 52, 140),
  inset: mapCanvas(width, true).inset,
});

const FRAMES: [string, MapFrame][] = [
  ["the narrowest dive card, outlined", card(252, 144)],
  ["the narrowest trip card", card(252, 104)],
  ["a list's one column just below `lg`", card(975, 104)],
  ["a hero on a phone", hero(390)],
  ["a hero on a desktop window", hero(1600)],
];

const PLACES: [string, MappableLocation[]][] = [
  ["a lone site", [{ latitude: 28.5721, longitude: 34.5372 }]],
  [
    "a site with entry and exit fixes a few hundred metres apart",
    [
      { latitude: 28.5721, longitude: 34.5372 },
      { latitude: 28.5702, longitude: 34.5391, variant: "fix" },
      { latitude: 28.5689, longitude: 34.5355, variant: "fix" },
    ],
  ],
  [
    "sites far enough apart to open further out than a lone one",
    [
      { latitude: 28.5721, longitude: 34.5372 },
      { latitude: 27.9158, longitude: 34.3299 },
    ],
  ],
  [
    "a country-sized trip part",
    [
      {
        latitude: 26.82,
        longitude: 30.8,
        bbox_south: 22,
        bbox_north: 31.67,
        bbox_west: 24.7,
        bbox_east: 36.9,
      },
    ],
  ],
  [
    // Wide rather than tall, so the frame's width decides the zoom.
    "a trip along an island chain",
    [
      { latitude: -8.4095, longitude: 115.1889 },
      { latitude: -8.8742, longitude: 125.7275 },
    ],
  ],
  [
    "a trip across the antimeridian",
    [
      { latitude: -18.1416, longitude: 178.4419 },
      { latitude: -13.8333, longitude: -171.7667 },
    ],
  ],
];

const CASES = FRAMES.flatMap(([frameName, frame]) =>
  PLACES.map(([placesName, locations]) => ({
    name: `${placesName}, in ${frameName}`,
    frame,
    locations,
  })),
);

describe("frameCamera", () => {
  it.each(CASES)(
    "fits $name as GL JS's own camera does",
    ({ frame, locations }) => {
      const expected = expectedCamera(locations, frame);
      const actual = frameCamera(placedLocations(locations), frame);

      expect(Math.abs(actual.zoom - expected.zoom)).toBeLessThan(0.01);
      expect(actual.center.latitude).toBeCloseTo(expected.center.latitude, 9);
      expect(actual.center.longitude).toBeCloseTo(expected.center.longitude, 9);
    },
  );

  // Not a parity check but the reason for one: a trip across the antimeridian
  // that fitted the long way round would open on the whole world.
  it("keeps a trip across the antimeridian narrow", () => {
    const { zoom } = frameCamera(placedLocations(PLACES[5][1]), card(252, 104));
    expect(zoom).toBeGreaterThan(2);
  });
});
