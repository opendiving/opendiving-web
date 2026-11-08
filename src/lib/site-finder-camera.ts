import { wrapLongitude, type LatLon, type LatLonBounds } from "@/lib/basemap";

/**
 * Where the site finder is asked to look: a point at a zoom, or a box to fit.
 * A box's `west` may exceed its `east`, crossing the antimeridian.
 */
export type FinderTarget =
  | ({ kind: "point"; zoom?: number } & LatLon)
  | ({ kind: "bounds" } & LatLonBounds);

/** The zoom a point opens at: a town and the coast around it. */
export const FINDER_POINT_ZOOM = 10;

/**
 * The centre a target puts the camera on. A box's is its middle the short way
 * round, so one straddling the antimeridian centres near 180° rather than at 0°.
 */
export function targetCenter(target: FinderTarget): LatLon {
  if (target.kind === "point") {
    return { latitude: target.latitude, longitude: target.longitude };
  }
  const span =
    target.west <= target.east
      ? target.east - target.west
      : target.east + 360 - target.west;
  return {
    latitude: (target.south + target.north) / 2,
    longitude: wrapLongitude(target.west + span / 2),
  };
}

// Two decimals, about a kilometre: what every coordinate the finder sends is cut
// to, whatever moved the camera, so the server's access logs hold a cell rather
// than a position. `toFixed` after the arithmetic, because `0.29 * 100` is not 29.
const STEP = 100;
const EPSILON = 1e-7;
const tidy = (value: number) => Number(value.toFixed(2)) + 0;
const round = (value: number) => tidy(Math.round(value * STEP) / STEP);
const down = (value: number) => tidy(Math.floor(value * STEP + EPSILON) / STEP);
const up = (value: number) => tidy(Math.ceil(value * STEP - EPSILON) / STEP);
const clamp = (value: number, limit: number) =>
  Math.min(limit, Math.max(-limit, value));

// Into (-180, 180], the half-open range an east edge wants: a view ending on
// the antimeridian ends at 180, not at -180, which would read as a box crossing it.
const wrapEast = (longitude: number) => -wrapLongitude(-longitude);

/** The camera as a request carries it: two decimals, longitude in range. */
export function roundCamera({ latitude, longitude }: LatLon): LatLon {
  return {
    latitude: round(clamp(latitude, 90)),
    longitude: round(wrapLongitude(longitude)),
  };
}

/**
 * The view as a request carries it: wrapped into -180…180, a `west` above `east`
 * where it crosses the antimeridian, rounded outward to two decimals so the box
 * still holds everything on screen, and the whole world where the view is wider
 * than one. `bounds` is the map's own, whose longitudes run past ±180 once the
 * camera has panned round.
 */
export function roundView(bounds: LatLonBounds): LatLonBounds {
  const south = down(clamp(Math.min(bounds.south, bounds.north), 90));
  const north = up(clamp(Math.max(bounds.south, bounds.north), 90));
  const world = { south, north, west: -180, east: 180 };
  if (bounds.east - bounds.west >= 360) return world;

  const wrappedWest = wrapLongitude(bounds.west);
  const wrappedEast = wrapEast(bounds.east);
  const crosses = wrappedWest > wrappedEast;
  const west = down(wrappedWest);
  const east = up(wrappedEast);
  // Rounding outward can only meet itself round the back of a view that was
  // already all but the whole world.
  if (crosses && west <= east) return world;
  return { south, north, west, east };
}
