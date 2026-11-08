"use client";

import { useEffect, useState } from "react";
import {
  diveSitesAPI,
  type CommonsDiveSitePoints,
  type DiveSitePoint,
  type HeldCommonsPoints,
} from "@/lib/api/dive-sites";

// The Commons document is one set of bytes for every account, so the copy read
// once in a session is held here and only revalidated by its `ETag` afterwards:
// a 304 costs the diver nothing but the round trip.
let heldCommons: HeldCommonsPoints | null = null;

export interface SiteFinderPoints {
  /** Every Commons record with a pin; null until read, and if it cannot be. */
  commons: CommonsDiveSitePoints | null;
  /** The diver's own and saved sites with a pin; null until read. */
  yours: DiveSitePoint[] | null;
}

/**
 * The two documents the finder's map draws. `refreshKey` re-reads the diver's
 * own after a write that adds, moves or removes one of their sites.
 */
export function useSiteFinderPoints(
  enabled: boolean,
  refreshKey = 0,
): SiteFinderPoints {
  const [commons, setCommons] = useState<CommonsDiveSitePoints | null>(
    () => heldCommons?.body ?? null,
  );
  const [yours, setYours] = useState<DiveSitePoint[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    diveSitesAPI
      .getCommonsDiveSitePoints(heldCommons)
      .then((held) => {
        heldCommons = held;
        if (active) setCommons(held.body);
      })
      .catch((error: unknown) => {
        console.error("Couldn't read the Commons sites for the map.", error);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    diveSitesAPI
      .getDiveSitePoints()
      .then((points) => {
        if (active) setYours(points);
      })
      .catch((error: unknown) => {
        console.error("Couldn't read your sites for the map.", error);
      });
    return () => {
      active = false;
    };
  }, [enabled, refreshKey]);

  return { commons, yours };
}
