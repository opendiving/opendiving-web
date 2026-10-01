import { afterEach, describe, expect, it } from "vitest";
import {
  Map as MapLibreMap,
  MercatorCoordinate,
  setWorkerUrl,
  type LngLatBoundsLike,
  type LngLatLike,
} from "maplibre-gl";

import {
  MAX_FIT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  unionBounds,
  WORLD_CENTER,
  type LatLonBounds,
} from "@/lib/basemap";
import {
  DIVE_CARD_FRAME,
  FIT_PADDING,
  placedLocations,
  SNAPSHOT_HEIGHT,
  SNAPSHOT_WIDTH,
  TRIP_CARD_FRAME,
  type CardFrame,
  type MappableLocation,
} from "@/lib/map-picture";
import { pictureCamera, type Camera } from "./camera";

// The renderer's fit against GL JS's own `cameraForBounds`, given the paddings
// the browser's backdrop fit passes it for a picture - built here against GL JS
// directly rather than by mounting `LocationsMap`, so it outlives the card
// pictures leaving the browser. A real browser because GL JS needs WebGL2 to
// build a map at all, and the expected camera is the one its transform settles
// on, constraints included.

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

// A map the size of a picture, fitted as `LocationsMap` fits a backdrop it is
// about to photograph: the frame's box placed so the band's middle is the
// picture's middle, the extents fitted over the frame and the pins over the
// band, and the pins' middle at the picture's middle.
async function expectedCamera(
  locations: MappableLocation[],
  frame: CardFrame,
): Promise<Camera> {
  const container = document.createElement("div");
  container.style.width = `${SNAPSHOT_WIDTH}px`;
  container.style.height = `${SNAPSHOT_HEIGHT}px`;
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
  const bounds = unionBounds(placed.map((location) => location.bounds));
  if (!bounds) {
    map.jumpTo({
      center: [WORLD_CENTER.longitude, WORLD_CENTER.latitude],
      zoom: MIN_ZOOM,
    });
  } else {
    const pins = unionBounds(
      placed.map(({ latitude, longitude }) => ({
        south: latitude,
        north: latitude,
        west: longitude,
        east: longitude,
      })),
    )!;
    const { band } = frame;
    const bandMiddle = (band.top + frame.height - band.bottom) / 2;
    const left = (SNAPSHOT_WIDTH - frame.width) / 2;
    const top = SNAPSHOT_HEIGHT / 2 - bandMiddle;
    const below = SNAPSHOT_HEIGHT - top - frame.height;
    const zoom = Math.min(
      map.cameraForBounds(corners(bounds), {
        padding: {
          left: left + FIT_PADDING,
          right: left + FIT_PADDING,
          top: top + FIT_PADDING,
          bottom: below + FIT_PADDING,
        },
        maxZoom: MAX_FIT_ZOOM,
      })?.zoom ?? MAX_FIT_ZOOM,
      map.cameraForBounds(corners(pins), {
        padding: {
          left: left + FIT_PADDING,
          right: left + FIT_PADDING,
          top: top + band.top,
          bottom: below + band.bottom,
        },
        maxZoom: MAX_FIT_ZOOM,
      })?.zoom ?? MAX_FIT_ZOOM,
    );
    const southWest = MercatorCoordinate.fromLngLat([pins.west, pins.south]);
    const northEast = MercatorCoordinate.fromLngLat([pins.east, pins.north]);
    map.jumpTo({
      center: new MercatorCoordinate(
        (southWest.x + northEast.x) / 2,
        (southWest.y + northEast.y) / 2,
      ).toLngLat(),
      zoom,
    });
  }

  const center = map.getCenter();
  return {
    center: { latitude: center.lat, longitude: center.lng },
    zoom: map.getZoom(),
  };
}

// How far apart two centres are on screen at `zoom`, the long way round the
// world excluded: a centre at 182.5 and one at -177.5 are the same view.
function pixelsApart(a: Camera, b: Camera, zoom: number) {
  const point = ({ center }: Camera): LngLatLike => [
    center.longitude,
    center.latitude,
  ];
  const one = MercatorCoordinate.fromLngLat(point(a));
  const other = MercatorCoordinate.fromLngLat(point(b));
  const worldSize = 512 * 2 ** zoom;
  const dx = ((one.x - other.x) % 1) + 1;
  return {
    x: (((dx + 0.5) % 1) - 0.5) * worldSize,
    y: (one.y - other.y) * worldSize,
  };
}

const CASES: {
  name: string;
  frame: CardFrame;
  locations: MappableLocation[];
}[] = [
  {
    name: "a lone site",
    frame: DIVE_CARD_FRAME,
    locations: [{ latitude: 28.5721, longitude: 34.5372 }],
  },
  {
    name: "a site with entry and exit fixes a few hundred metres apart",
    frame: DIVE_CARD_FRAME,
    locations: [
      { latitude: 28.5721, longitude: 34.5372 },
      { latitude: 28.5702, longitude: 34.5391, variant: "fix" },
      { latitude: 28.5689, longitude: 34.5355, variant: "fix" },
    ],
  },
  {
    name: "sites far enough apart to open further out than a lone one",
    frame: DIVE_CARD_FRAME,
    locations: [
      { latitude: 28.5721, longitude: 34.5372 },
      { latitude: 27.9158, longitude: 34.3299 },
    ],
  },
  {
    name: "a country-sized trip part",
    frame: TRIP_CARD_FRAME,
    locations: [
      {
        latitude: 26.82,
        longitude: 30.8,
        bbox_south: 22,
        bbox_north: 31.67,
        bbox_west: 24.7,
        bbox_east: 36.9,
      },
    ],
  },
  {
    name: "a trip across the antimeridian",
    frame: TRIP_CARD_FRAME,
    locations: [
      { latitude: -18.1416, longitude: 178.4419 },
      { latitude: -13.8333, longitude: -171.7667 },
    ],
  },
  {
    name: "a trip with no place",
    frame: TRIP_CARD_FRAME,
    locations: [],
  },
];

describe("pictureCamera", () => {
  it.each(CASES)(
    "fits $name as GL JS's own camera does",
    async ({ frame, locations }) => {
      const expected = await expectedCamera(locations, frame);
      const actual = pictureCamera(placedLocations(locations), frame);

      expect(Math.abs(actual.zoom - expected.zoom)).toBeLessThan(0.01);
      const apart = pixelsApart(actual, expected, expected.zoom);
      expect(Math.abs(apart.x)).toBeLessThan(1);
      expect(Math.abs(apart.y)).toBeLessThan(1);
    },
  );

  // Not a parity check but the reason for one: a trip across the antimeridian
  // that fitted the long way round would open on the whole world.
  it("keeps a trip across the antimeridian narrow", () => {
    const { zoom } = pictureCamera(
      placedLocations(CASES[4].locations),
      TRIP_CARD_FRAME,
    );
    expect(zoom).toBeGreaterThan(2);
  });
});
