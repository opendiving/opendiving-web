"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAllPeople, type Person } from "@/lib/api/people";

/**
 * The people behind a set of uuids, for a surface that prints several names - a
 * dive's People card, a trip's or a course's people, the rows of a people
 * picker. The records store the uuid and the role and nothing else, so the names
 * are read here.
 *
 * One read of the whole list rather than one request per uuid, the shape
 * `useContactsByUuid` has and for its reason. It is read again only when a uuid
 * turns up that the last read did not hold - a person created from a picker on
 * the same page - and never for one that read already answered, so a person
 * deleted since is not asked for on every render.
 *
 * Non-fatal: a failed read leaves the names out, as the dive page leaves out a
 * trip it could not look up.
 */
export function usePeopleByUuid(
  uuids: readonly (string | null | undefined)[],
): Record<string, Person> {
  const [people, setPeople] = useState<Record<string, Person>>({});
  // Every uuid a finished read has answered for, whether or not it found it.
  const answeredRef = useRef<Set<string>>(new Set());

  // A string rather than the array, so a caller building its list inline does not
  // re-run the effect on every render.
  const wanted = [...new Set(uuids.filter((uuid): uuid is string => !!uuid))]
    .sort()
    .join(",");

  useEffect(() => {
    if (!wanted) return;
    const missing = wanted
      .split(",")
      .filter((uuid) => !answeredRef.current.has(uuid));
    if (missing.length === 0) return;

    const controller = new AbortController();
    fetchAllPeople(controller.signal)
      .then((all) => {
        for (const uuid of missing) answeredRef.current.add(uuid);
        for (const person of all) answeredRef.current.add(person.uuid);
        setPeople(
          Object.fromEntries(all.map((person) => [person.uuid, person])),
        );
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch people:", error);
      });
    return () => controller.abort();
  }, [wanted]);

  return people;
}
