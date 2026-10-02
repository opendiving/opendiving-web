"use client";

import { useEffect, useState } from "react";
import { speciesAPI, type SpeciesLifeListDetail } from "@/lib/api/species";

/**
 * The signed-in diver's history with one species, for the species page's
 * figures. `entry` is `null` when none of their dives records it, and `failed`
 * says the lookup itself went wrong - which leaves the figures out rather than
 * claiming none.
 *
 * Held with the uuid it was read for, so the next species' page never shows the
 * previous one's figures for the round trip in between.
 */
export function useSpeciesLifeListEntry(uuid: string | undefined): {
  entry: SpeciesLifeListDetail | null;
  isLoading: boolean;
  failed: boolean;
} {
  const [loaded, setLoaded] = useState<{
    uuid: string;
    entry: SpeciesLifeListDetail | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!uuid) return;
    let cancelled = false;

    speciesAPI
      .getLifeListEntry(uuid)
      .then((entry) => {
        if (!cancelled) setLoaded({ uuid, entry, failed: false });
      })
      .catch((error) => {
        console.error("Failed to fetch species history:", error);
        if (!cancelled) setLoaded({ uuid, entry: null, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [uuid]);

  const current = uuid && loaded?.uuid === uuid ? loaded : null;
  return {
    entry: current?.entry ?? null,
    isLoading: !!uuid && !current,
    failed: current?.failed ?? false,
  };
}
