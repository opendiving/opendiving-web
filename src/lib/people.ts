import type { PersonReference } from "@/lib/api/people";

// The roles a course gives the people on it. They belong to the course rather
// than to the diver's week, so they follow the course's carry-over rule and not
// a buddy's.
const COURSE_ROLES: ReadonlySet<string> = new Set(["instructor", "student"]);

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
 * The people a new dive starts with.
 *
 * The last dive's people carry over, as its trip and its dive center do: a week
 * with one buddy is logged with them dive after dive. Its instructor and
 * students do not, unless the new dive is on the same course - last week's
 * instructor on this week's fun dive is the worse default. A course the page
 * was opened for ("Log a dive for this course") puts its own people first, with
 * their roles.
 */
export function carriedPeople({
  lastDive,
  courseUuid,
  coursePeople = [],
}: {
  lastDive?: {
    people?: PersonReference[] | null;
    course_uuid?: string | null;
  } | null;
  courseUuid?: string | null;
  coursePeople?: readonly PersonReference[];
}): PersonReference[] {
  const sameCourse = !!courseUuid && lastDive?.course_uuid === courseUuid;
  const fromLastDive = (lastDive?.people ?? []).filter(
    (reference) =>
      sameCourse ||
      reference.role === null ||
      !COURSE_ROLES.has(reference.role),
  );
  return mergePeople(coursePeople, fromLastDive);
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
