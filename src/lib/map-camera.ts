// Where a card's or a page head's map looks, and which tiles of the grid
// (`lib/map-grid.ts`) show it: a frame's fit as plain Web Mercator arithmetic,
// and the tiles that cover the frame once its zoom is floored to one the map
// renderer draws. `map-camera.browser.test.ts` holds the fit to what GL JS's own
// `cameraForBounds` computes for the same places and frame.

import {
  clampLatitude,
  MAX_FIT_ZOOM,
  MIN_ZOOM,
  unionBounds,
  WORLD_CENTER,
  wrapLongitude,
  type LatLon,
  type LatLonBounds,
} from "@/lib/basemap";
import { FIT_PADDING, type PlacedLocation } from "@/lib/map-frame";
import {
  latitudeAt,
  longitudeAt,
  mercatorX,
  mercatorY,
  TILE_SIZE,
} from "@/lib/map-grid";

export interface Camera {
  center: LatLon;
  zoom: number;
}

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

/**
 * A frame a map is fitted for, in CSS pixels: its size, the band its pins are
 * kept to as padding from its top and bottom (`bandIn`), and how far in from
 * its sides its places are kept (`mapCanvas`).
 */
export interface MapFrame {
  width: number;
  height: number;
  band: { top: number; bottom: number };
  inset: number;
}

/**
 * The camera of a map fitted for `frame`: centred on the pins' middle, which the
 * frame shows at the middle of its band, at the lesser of two zooms - the
 * places' extents fitted over the whole frame, so a town's outline does not open
 * at a zoom its own label does not show at, and the pins fitted into the band -
 * capped at `MAX_FIT_ZOOM`. Not floored: `tileLayout` does that.
 *
 * Nothing placed is the whole world at `MIN_ZOOM`, its middle - the equator,
 * rather than `WORLD_CENTER`'s latitude - at the band's, so the frame shows as
 * much of the world north of the band as south of it.
 */
export function frameCamera(
  placed: readonly PlacedLocation[],
  frame: MapFrame,
): Camera {
  const bounds = unionBounds(placed.map((location) => location.bounds));
  if (!bounds) {
    return {
      center: { latitude: 0, longitude: WORLD_CENTER.longitude },
      zoom: MIN_ZOOM,
    };
  }

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
  const width = frame.width - 2 * frame.inset;
  const zoom = Math.min(
    fitZoom(bounds, width, frame.height - 2 * FIT_PADDING) ?? MAX_FIT_ZOOM,
    fitZoom(pins, width, frame.height - frame.band.top - frame.band.bottom) ??
      MAX_FIT_ZOOM,
  );

  return {
    center: {
      longitude: wrapLongitude(
        longitudeAt((mercatorX(pins.west) + mercatorX(pins.east)) / 2),
      ),
      latitude: latitudeAt(
        (mercatorY(clampLatitude(pins.south)) +
          mercatorY(clampLatitude(pins.north))) /
          2,
      ),
    },
    zoom,
  };
}

/**
 * The camera of the world picture, the grid's one square at zoom 0, fitted for
 * `frame`: never zoomed, since the picture has one size, and its pins' middle
 * at the band's, as `frameCamera` has it. Across, Greenwich at the frame's
 * middle - the Pacific at the world's sides - unless a frame too narrow for
 * the whole world would leave a pin off it and the shortest stretch of
 * longitude holding every pin fits, which is then at the middle instead. Pins
 * that fit no way round keep Greenwich: a world map's way of showing most of
 * them.
 */
export function worldCamera(
  placed: readonly PlacedLocation[],
  frame: MapFrame,
): Camera {
  const { latitude } = frameCamera(placed, frame).center;
  // In degrees of longitude, the most a frame shows either side of its middle.
  const reach = ((frame.width - 2 * frame.inset) / 2 / TILE_SIZE) * 360;
  const longitudes = placed
    .map(({ longitude }) => wrapLongitude(longitude))
    .sort((a, b) => a - b);
  const greenwich = { center: { latitude, longitude: 0 }, zoom: 0 };
  if (longitudes.every((longitude) => Math.abs(longitude) <= reach)) {
    return greenwich;
  }

  // The stretch holding every pin is the world less its widest empty gap.
  let gap = longitudes[0] + 360 - longitudes[longitudes.length - 1];
  let east = longitudes[longitudes.length - 1];
  for (let index = 1; index < longitudes.length; index += 1) {
    const between = longitudes[index] - longitudes[index - 1];
    if (between > gap) {
      gap = between;
      east = longitudes[index - 1];
    }
  }
  const span = 360 - gap;
  if (span > 2 * reach) return greenwich;
  return {
    center: { latitude, longitude: wrapLongitude(east - span / 2) },
    zoom: 0,
  };
}

/** One square of the grid, and where it lies from the camera's centre. */
export interface PlacedTile {
  z: number;
  // Within the grid: a column past the antimeridian is the same tile as the
  // one it wraps to.
  x: number;
  y: number;
  // Its top-left corner, in CSS pixels from the camera's centre.
  left: number;
  top: number;
}

/**
 * The tiles a frame shows, at `camera`'s zoom floored to an integer - the only
 * zooms there are tiles at - and kept within `MIN_ZOOM` and `MAX_FIT_ZOOM`.
 * Flooring only ever draws the pins closer together, so every pin the fit put
 * inside the band stays inside it, and a tile's lettering stays the size it was
 * drawn at.
 *
 * `area` is what has to be covered, in CSS pixels from where the frame shows
 * the camera's centre. Rows past the world's top or bottom edge are not asked
 * for - there is nothing to draw there - and columns wrap, so a frame across the
 * antimeridian shows both sides of it.
 *
 * The centre is put on a whole pixel of the grid, so every tile lands on whole
 * CSS pixels and tiles meet without a seam.
 */
export function tileLayout(
  camera: Camera,
  area: { left: number; top: number; right: number; bottom: number },
): { zoom: number; origin: { x: number; y: number }; tiles: PlacedTile[] } {
  const zoom = Math.min(
    MAX_FIT_ZOOM,
    Math.max(MIN_ZOOM, Math.floor(camera.zoom)),
  );
  const tiles = 2 ** zoom;
  const worldSize = TILE_SIZE * tiles;
  const origin = {
    x: Math.round(mercatorX(camera.center.longitude) * worldSize),
    y: Math.round(mercatorY(clampLatitude(camera.center.latitude)) * worldSize),
  };

  const first = Math.floor((origin.x + area.left) / TILE_SIZE);
  const last = Math.ceil((origin.x + area.right) / TILE_SIZE) - 1;
  const top = Math.max(0, Math.floor((origin.y + area.top) / TILE_SIZE));
  const bottom = Math.min(
    tiles - 1,
    Math.ceil((origin.y + area.bottom) / TILE_SIZE) - 1,
  );

  const placed: PlacedTile[] = [];
  for (let row = top; row <= bottom; row += 1) {
    for (let column = first; column <= last; column += 1) {
      placed.push({
        z: zoom,
        x: ((column % tiles) + tiles) % tiles,
        y: row,
        left: column * TILE_SIZE - origin.x,
        top: row * TILE_SIZE - origin.y,
      });
    }
  }
  return { zoom, origin, tiles: placed };
}

/**
 * Where a position lies, in CSS pixels from the camera's centre of a
 * `tileLayout` - on the copy of the world nearest that centre, so a trip
 * fitted across the antimeridian keeps a place at 178E beside one at 172W.
 */
export function projectFrom(
  { zoom, origin }: { zoom: number; origin: { x: number; y: number } },
  { latitude, longitude }: LatLon,
): { left: number; top: number } {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const across = mercatorX(longitude) - origin.x / worldSize;
  return {
    left: (across - Math.round(across)) * worldSize,
    top: mercatorY(clampLatitude(latitude)) * worldSize - origin.y,
  };
}
