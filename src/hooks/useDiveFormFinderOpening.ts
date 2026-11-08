"use client";

import { tripsAPI, type TripLookupPart } from "@/lib/api/trips";
import type { LatLon } from "@/lib/basemap";
import type { FinderTarget } from "@/lib/site-finder-camera";
import { diveFormOpening, sitesTarget } from "@/lib/site-finder-opening";
import { useLookupLabels } from "@/hooks/useLookupLabels";

const lookupTrips = (uuids: string[]) => tripsAPI.lookupTripsByUuid(uuids);

type Pin = { latitude?: number | null; longitude?: number | null };

/**
 * Where the dive form's finder opens, by the form's own data: the dive's pinned
 * sites, its GPS fix, the trip part holding its start date, or the world (`null`).
 * `undefined` while a step that could answer is still being read - a chosen
 * site's row or the trip's - so the camera waits rather than jumping twice.
 *
 * The trip's lookup row, which carries its parts, is read only while `active`
 * and only when neither the sites nor the fix answer.
 */
export function useDiveFormFinderOpening({
  active,
  sites,
  fix,
  tripUuid,
  startTime,
}: {
  active: boolean;
  /** One entry per chosen site: its row, or `undefined` while it is being read. */
  sites: readonly (Pin | undefined)[];
  fix: LatLon | null | undefined;
  tripUuid: string | null | undefined;
  /** The dive's start as the form holds it; its date is the trip step's day. */
  startTime: string | undefined;
}): FinderTarget | null | undefined {
  const known = sites.every(Boolean) ? (sites as Pin[]) : null;
  const day = startTime?.slice(0, 10);
  const needsTrip =
    active && !!known && !sitesTarget(known) && !fix && !!tripUuid && !!day;
  const { records, unresolved } = useLookupLabels(
    lookupTrips,
    needsTrip ? [tripUuid] : [],
  );

  if (!known) return undefined;
  let tripParts: readonly TripLookupPart[] = [];
  if (needsTrip) {
    const trip = records[tripUuid!];
    if (!trip && !unresolved.has(tripUuid!)) return undefined;
    tripParts = trip?.parts ?? [];
  }
  return diveFormOpening({ sites: known, fix, tripParts, day });
}
