"use client";

import { useEffect, useState } from "react";
import { peopleAPI, type Person } from "@/lib/api/people";

/**
 * The person a record names by uuid, for a surface that prints the one name - a
 * certification's instructor. `null` while it loads, when there is no uuid, and
 * when the lookup failed: a missing name leaves its row out rather than failing
 * the page, as `useContact` does.
 *
 * Held with the uuid it was read for, so a card relinked to another instructor
 * never shows the previous one's name for the round trip in between.
 */
export function usePerson(uuid: string | null | undefined): Person | null {
  const [loaded, setLoaded] = useState<{
    uuid: string;
    person: Person;
  } | null>(null);

  useEffect(() => {
    if (!uuid) return;
    let cancelled = false;

    peopleAPI
      .getPerson(uuid)
      .then((person) => {
        if (!cancelled) setLoaded({ uuid, person });
      })
      .catch((error) => console.error("Failed to fetch person:", error));

    return () => {
      cancelled = true;
    };
  }, [uuid]);

  return uuid && loaded?.uuid === uuid ? loaded.person : null;
}
