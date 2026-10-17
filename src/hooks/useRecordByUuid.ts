"use client";

import { useEffect, useState } from "react";

/**
 * The record another names by uuid, for a surface that prints the one name - a
 * course's dive center, a certification's instructor. `null` while it loads, when
 * there is no uuid, and when the read failed: a missing name leaves its row out
 * rather than failing the page, as the dive page's trip link does.
 *
 * Held with the uuid it was read for, so a record relinked to another never shows
 * the previous one's name for the round trip in between. `read` must keep its
 * identity across renders.
 */
export function useRecordByUuid<T>(
  read: (uuid: string) => Promise<T>,
  uuid: string | null | undefined,
): T | null {
  const [loaded, setLoaded] = useState<{ uuid: string; record: T } | null>(
    null,
  );

  useEffect(() => {
    if (!uuid) return;
    let cancelled = false;

    read(uuid)
      .then((record) => {
        if (!cancelled) setLoaded({ uuid, record });
      })
      .catch((error) => console.error("Failed to read a record:", error));

    return () => {
      cancelled = true;
    };
  }, [read, uuid]);

  return uuid && loaded?.uuid === uuid ? loaded.record : null;
}
