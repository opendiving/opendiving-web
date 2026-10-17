"use client";

import { peopleAPI, type Person } from "@/lib/api/people";
import { readEach, useLookupLabels } from "@/hooks/useLookupLabels";

const readPeople = readEach((uuid: string) => peopleAPI.getPerson(uuid));

/**
 * The people behind a set of uuids, for a surface that prints several names - a
 * dive's People card, a trip's or a course's people, the rows of a people
 * picker. The records store the uuid and the role and nothing else, so the names
 * are read here: one read per uuid, each fired once, as every picker's label is -
 * see `useContactsByUuid` for why the contacts are read otherwise.
 *
 * Non-fatal: a failed read leaves that name out, as the dive page leaves out a
 * trip it could not look up.
 */
export function usePeopleByUuid(
  uuids: readonly (string | null | undefined)[],
): Record<string, Person> {
  return useLookupLabels(readPeople, uuids).records;
}
