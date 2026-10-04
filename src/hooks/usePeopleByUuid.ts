"use client";

import { useEffect, useRef, useState } from "react";
import { peopleAPI, type Person } from "@/lib/api/people";

/**
 * The people behind a set of uuids, for a surface that prints several names - a
 * dive's People card, a trip's or a course's people, the rows of a people
 * picker. The records store the uuid and the role and nothing else, so the names
 * are read here.
 *
 * One read per uuid, each fired once - the shape the pickers' per-uuid reads
 * have - so a surface naming three people reads three, never the whole list, and
 * a person deleted since is not asked for on every render. No cancellation: under
 * StrictMode the read in flight is the discarded mount's, and dropping its
 * result would drop the name for good. Merging into a uuid-keyed map is
 * idempotent, so a late arrival is always safe to apply.
 *
 * Non-fatal: a failed read leaves that name out, as the dive page leaves out a
 * trip it could not look up.
 */
export function usePeopleByUuid(
  uuids: readonly (string | null | undefined)[],
): Record<string, Person> {
  const [people, setPeople] = useState<Record<string, Person>>({});
  // Every uuid a read has been fired for, whether or not it found it.
  const requestedRef = useRef<Set<string>>(new Set());

  // A string rather than the array, so a caller building its list inline does not
  // re-run the effect on every render.
  const wanted = [...new Set(uuids.filter((uuid): uuid is string => !!uuid))]
    .sort()
    .join(",");

  useEffect(() => {
    if (!wanted) return;
    const missing = wanted
      .split(",")
      .filter((uuid) => !requestedRef.current.has(uuid));
    for (const uuid of missing) {
      requestedRef.current.add(uuid);
      peopleAPI
        .getPerson(uuid)
        .then((person) =>
          setPeople((previous) => ({ ...previous, [person.uuid]: person })),
        )
        .catch((error) => console.error("Failed to fetch person:", error));
    }
  }, [wanted]);

  return people;
}
