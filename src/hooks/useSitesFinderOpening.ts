"use client";

import { useEffect, useState } from "react";
import { divesAPI } from "@/lib/api/dives";
import { tripsAPI } from "@/lib/api/trips";
import { todayIsoDate } from "@/lib/date-time";
import type { FinderTarget } from "@/lib/site-finder-camera";
import { sitesOpening } from "@/lib/site-finder-opening";

// Trips come newest first, so a trip holding today is at the head of the list.
const TRIPS_READ = 10;

/**
 * Where the Sites section's finder opens: a trip part whose dates hold today,
 * else the newest dive's place, else the world (`null`). `undefined` until both
 * reads have settled, so the camera opens once rather than jumping when the
 * second lands. A read that fails is a step with nothing to say. Resolved once
 * per mount: a route shown again keeps the camera the diver left it on.
 */
export function useSitesFinderOpening(
  enabled: boolean,
): FinderTarget | null | undefined {
  const [opening, setOpening] = useState<FinderTarget | null | undefined>();
  const settled = opening !== undefined;

  useEffect(() => {
    if (!enabled || settled) return;
    let active = true;
    const quietly = <T>(read: Promise<T>) =>
      read.catch((error: unknown) => {
        console.error("Couldn't read where the dive site map opens.", error);
        return null;
      });
    Promise.all([
      quietly(tripsAPI.getTrips(1, TRIPS_READ)),
      quietly(divesAPI.getDives(1, 1, { sort: "date" })),
    ]).then(([trips, dives]) => {
      if (!active) return;
      setOpening(
        sitesOpening({
          tripParts: (trips?.data ?? []).flatMap((trip) => trip.parts),
          newestDive: dives?.data[0] ?? null,
          today: todayIsoDate(),
        }),
      );
    });
    return () => {
      active = false;
    };
  }, [enabled, settled]);

  return opening;
}
