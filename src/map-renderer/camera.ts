// Where a card's picture looks: the backdrop fit `LocationsMap` computes in the
// browser, as plain Web Mercator arithmetic.
//
// MapLibre Native renders at a centre and a zoom it is given and has nothing
// like GL JS's `cameraForBounds`, so the fit is done here - in the units GL JS
// uses, a 512 px tile, which MapLibre Native shares. `camera.browser.test.ts`
// holds it to what GL JS itself computes for the same places and frame.
//
// No Node-only imports: that test runs this file in a browser.

import {
  MAX_FIT_ZOOM,
  MAX_LATITUDE,
  MAX_ZOOM,
  MIN_ZOOM,
  unionBounds,
  WORLD_CENTER,
  wrapLongitude,
  type LatLon,
  type LatLonBounds,
} from "@/lib/basemap";
import {
  FIT_PADDING,
  SNAPSHOT_HEIGHT,
  type CardFrame,
  type PlacedLocation,
} from "@/lib/map-picture";

const TILE_SIZE = 512;

export interface Camera {
  center: LatLon;
  zoom: number;
}

// GL JS's own projection, in its own spelling, so the two agree to the last
// bit rather than to a rounding.
const mercatorX = (longitude: number) => (180 + longitude) / 360;
const mercatorY = (latitude: number) =>
  (180 -
    (180 / Math.PI) *
      Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360))) /
  360;
const longitudeAt = (x: number) => x * 360 - 180;
const latitudeAt = (y: number) =>
  (360 / Math.PI) * Math.atan(Math.exp(((180 - y * 360) * Math.PI) / 180)) - 90;
const clampLatitude = (latitude: number) =>
  Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, latitude));

// The deepest zoom at which `box` fits `width` by `height`, capped at
// `MAX_FIT_ZOOM` - `cameraForBounds`' arithmetic, which also answers nothing at
// all when the padding leaves no room.
function fitZoom(
  box: LatLonBounds,
  width: number,
  height: number,
): number | undefined {
  if (width < 0 || height < 0) return undefined;
  const spanX = (mercatorX(box.east) - mercatorX(box.west)) * TILE_SIZE;
  const spanY =
    (mercatorY(clampLatitude(box.south)) -
      mercatorY(clampLatitude(box.north))) *
    TILE_SIZE;
  return Math.min(
    Math.log2(Math.min(width / spanX, height / spanY)),
    MAX_FIT_ZOOM,
  );
}

// What GL JS's transform does to any camera it is handed: the zoom kept within
// the map's range, and the world kept filling the picture top to bottom. A
// picture `SNAPSHOT_HEIGHT` tall at zoom 0 is exactly the world's height, so the
// whole-world view opens on the equator whatever centre it was asked for.
function constrained({ center, zoom }: Camera): Camera {
  let constrainedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  let worldSize = TILE_SIZE * 2 ** constrainedZoom;
  const top = mercatorY(MAX_LATITUDE) * worldSize;
  const bottom = mercatorY(-MAX_LATITUDE) * worldSize;
  let y = mercatorY(center.latitude) * worldSize;

  if (bottom - top < SNAPSHOT_HEIGHT) {
    constrainedZoom += Math.log2(SNAPSHOT_HEIGHT / (bottom - top));
    worldSize = TILE_SIZE * 2 ** constrainedZoom;
    y = worldSize / 2;
  } else {
    const half = SNAPSHOT_HEIGHT / 2;
    y = Math.min(Math.max(y, top + half), bottom - half);
  }

  return {
    center: {
      latitude: latitudeAt(y / worldSize),
      longitude: wrapLongitude(center.longitude),
    },
    zoom: constrainedZoom,
  };
}

/**
 * The camera of a picture fitted for `frame`: its middle on the pins' middle,
 * at the lesser of two zooms - the places' extents fitted over the whole frame,
 * so a town's outline does not open at a zoom its own label does not show at,
 * and the pins fitted into the band - capped at `MAX_FIT_ZOOM`. The browser
 * places the picture with its middle on a card's band middle, so every pin
 * lands in the band of any card at least this wide and this tall.
 *
 * Nothing placed is the whole world, as a trip card with no place shows it.
 */
export function pictureCamera(
  placed: readonly PlacedLocation[],
  frame: CardFrame,
): Camera {
  const bounds = unionBounds(placed.map((location) => location.bounds));
  if (!bounds) return constrained({ center: WORLD_CENTER, zoom: MIN_ZOOM });

  // The pins' own extent - unwrapped across the antimeridian by `unionBounds`,
  // so Fiji and Samoa are six degrees apart rather than 354 - and their middle
  // as the screen has it, which in latitude is not the average of two degrees.
  const pins = unionBounds(
    placed.map(({ latitude, longitude }) => ({
      south: latitude,
      north: latitude,
      west: longitude,
      east: longitude,
    })),
  )!;
  const width = frame.width - 2 * FIT_PADDING;
  const zoom = Math.min(
    fitZoom(bounds, width, frame.height - 2 * FIT_PADDING) ?? MAX_FIT_ZOOM,
    fitZoom(pins, width, frame.height - frame.band.top - frame.band.bottom) ??
      MAX_FIT_ZOOM,
  );

  return constrained({
    center: {
      longitude: longitudeAt((mercatorX(pins.west) + mercatorX(pins.east)) / 2),
      latitude: latitudeAt((mercatorY(pins.south) + mercatorY(pins.north)) / 2),
    },
    zoom,
  });
}
