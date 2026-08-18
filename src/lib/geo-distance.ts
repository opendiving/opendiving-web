// How far apart two recorded positions are, and how to say it.
//
// This exists because the read-only map cannot show it. That map is capped at
// zoom 10 (see DECISIONS.md), where a hundred metres is less than a pixel, so
// an entry and an exit fix a swim apart are drawn as one dot. The distance is
// real and worth seeing, so it is text.

import { FEET_PER_MILE, METERS_PER_FOOT, type UnitSystem } from "@/lib/units";

// A position, in the same two field names everything else in the app uses.
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// Mean Earth radius (IUGG), in metres. A sphere, not the WGS-84 ellipsoid:
// the error is a few tenths of a percent, which is nothing beside the tens of
// metres a dive computer's own fix is out by after a swim under water.
const EARTH_RADIUS_M = 6371008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two positions, in metres.
 *
 * Haversine, which needs no special case for the antimeridian: it works on the
 * *difference* between the longitudes, so 179.9999°E to 179.9999°W is the 22 m
 * it looks like on a globe rather than the 40,000 km the two numbers suggest.
 */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(b.longitude - a.longitude);

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A distance for display: whole metres up to a kilometre, then one decimal -
 * or whole feet up to a mile, then one decimal, for a diver reading in imperial.
 *
 * No decimals on the small unit, deliberately - a consumer GPS fix is good to
 * something like five metres, and "212.4 m" claims a precision the reading
 * never had. Past the big unit's threshold the tenth is back, because "1 km" and
 * "1.9 km" are a real difference to anyone reading where their drift took them.
 *
 * Lives here rather than in `lib/units.ts` with the other formatters: the
 * kilometre threshold and the tests behind it are this module's, and a drift is
 * the only distance the app renders.
 */
export function formatDistance(meters: number, units: UnitSystem): string {
  if (units === "imperial") {
    const feet = meters / METERS_PER_FOOT;
    const wholeFeet = Math.round(feet);
    if (wholeFeet < FEET_PER_MILE) return `${wholeFeet} ft`;
    return `${(feet / FEET_PER_MILE).toFixed(1)} mi`;
  }

  // Rounded before the comparison, not after: 999.6 m is a thousand metres once
  // the decimals are gone, and "1000 m" beside a "1.0 km" a millimetre further
  // on would look like two different units for the same distance.
  const wholeMeters = Math.round(meters);
  if (wholeMeters < 1000) return `${wholeMeters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
