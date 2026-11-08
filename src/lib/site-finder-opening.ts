import { unionBounds, type LatLon } from "@/lib/basemap";
import type { Dive } from "@/lib/api/dives";
import type { Location } from "@/lib/api/location";
import type { TripLookupPart } from "@/lib/api/trips";
import type { FinderTarget } from "@/lib/site-finder-camera";

// The steps a finder opens by. Each answers a target or nothing, and the first to
// answer is where the camera opens; the server has no part in it.

/**
 * Whether a part's dates hold `day` (`YYYY-MM-DD`). A part dated at one end only
 * is that day; a part with no dates holds none.
 */
export function partHolds(part: TripLookupPart, day: string): boolean {
  const start = part.start_date ?? part.end_date;
  const end = part.end_date ?? part.start_date;
  if (!start || !end) return false;
  return start <= day && day <= end;
}

/** A place as a camera target: its box where it has one, else its point. */
export function locationTarget(
  location: Location | null | undefined,
): FinderTarget | null {
  if (location?.latitude == null || location.longitude == null) return null;
  const { bbox_south, bbox_north, bbox_west, bbox_east } = location;
  if (
    bbox_south != null &&
    bbox_north != null &&
    bbox_west != null &&
    bbox_east != null
  ) {
    return {
      kind: "bounds",
      south: bbox_south,
      north: bbox_north,
      west: bbox_west,
      east: bbox_east,
    };
  }
  return {
    kind: "point",
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

/** The first part, in the order given, whose dates hold `day` and that has a place. */
export function partTarget(
  parts: readonly TripLookupPart[],
  day: string,
): FinderTarget | null {
  for (const part of parts) {
    if (!partHolds(part, day)) continue;
    const target = locationTarget(part.location);
    if (target) return target;
  }
  return null;
}

/** A dive's place: its entry fix, else its primary site's pin. */
export function diveTarget(
  dive: Pick<Dive, "entry_latitude" | "entry_longitude" | "dive_sites">,
): FinderTarget | null {
  if (dive.entry_latitude != null && dive.entry_longitude != null) {
    return {
      kind: "point",
      latitude: dive.entry_latitude,
      longitude: dive.entry_longitude,
    };
  }
  const primary = dive.dive_sites[0];
  if (primary?.latitude != null && primary.longitude != null) {
    return {
      kind: "point",
      latitude: primary.latitude,
      longitude: primary.longitude,
    };
  }
  return null;
}

/**
 * Where the Sites section's finder opens: a trip part whose dates hold today,
 * the first in the trip list's order, else the newest dive's place, else the
 * world (`null`).
 */
export function sitesOpening({
  tripParts,
  newestDive,
  today,
}: {
  tripParts: readonly TripLookupPart[];
  newestDive: Parameters<typeof diveTarget>[0] | null;
  today: string;
}): FinderTarget | null {
  return partTarget(tripParts, today) ?? (newestDive && diveTarget(newestDive));
}

/**
 * The sites a dive names as one target: a lone pin as a point, several fitted
 * the short way round. Sites with no pin play no part; none pinned is nothing.
 */
export function sitesTarget(
  sites: readonly { latitude?: number | null; longitude?: number | null }[],
): FinderTarget | null {
  const pins = sites.flatMap((site) =>
    site.latitude != null && site.longitude != null
      ? [{ latitude: site.latitude, longitude: site.longitude }]
      : [],
  );
  if (pins.length === 1) return { kind: "point", ...pins[0] };
  const box = unionBounds(
    pins.map(({ latitude, longitude }) => ({
      south: latitude,
      north: latitude,
      west: longitude,
      east: longitude,
    })),
  );
  return box && { kind: "bounds", ...box };
}

/**
 * Where the dive form's finder opens: the dive's pinned sites, fitted, else its
 * GPS fix, else the first part of its trip whose dates hold `day` - the dive's
 * own start date - else the world (`null`). The web has no location step: the
 * browser is asked on a tap alone.
 */
export function diveFormOpening({
  sites,
  fix,
  tripParts,
  day,
}: {
  sites: Parameters<typeof sitesTarget>[0];
  fix: LatLon | null | undefined;
  tripParts: readonly TripLookupPart[];
  day: string | null | undefined;
}): FinderTarget | null {
  return (
    sitesTarget(sites) ??
    (fix
      ? { kind: "point", latitude: fix.latitude, longitude: fix.longitude }
      : null) ??
    (day ? partTarget(tripParts, day) : null)
  );
}
