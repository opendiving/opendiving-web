import type { PersonReference } from "@/lib/api/people";

/**
 * Two lists of references as one, in order, each person once - the first list's
 * reference wins, role and all, which is also what the API keeps when a uuid
 * repeats.
 */
export function mergePeople(
  first: readonly PersonReference[],
  second: readonly PersonReference[],
): PersonReference[] {
  const seen = new Set(first.map((reference) => reference.person_uuid));
  return [
    ...first,
    ...second.filter((reference) => !seen.has(reference.person_uuid)),
  ];
}

/**
 * A course's people as its dialog holds them: the first instructor on a field of
 * their own, and everyone else on the list below it.
 */
export function splitCourseInstructor(
  people: readonly PersonReference[] | null | undefined,
): { instructorUuid: string | null; others: PersonReference[] } {
  const instructor = (people ?? []).find(
    (reference) => reference.role === "instructor",
  );
  return {
    instructorUuid: instructor?.person_uuid ?? null,
    others: (people ?? []).filter((reference) => reference !== instructor),
  };
}

/**
 * The inverse: the instructor picked on its own field first, as the instructor,
 * and nobody twice - the instructor wins over a row naming the same person.
 */
export function joinCourseInstructor(
  instructorUuid: string | null | undefined,
  others: readonly PersonReference[],
): PersonReference[] {
  return instructorUuid
    ? mergePeople([{ person_uuid: instructorUuid, role: "instructor" }], others)
    : [...others];
}
