import {
  COURSE_STATUSES,
  type Course,
  type CourseStatus,
} from "@/lib/api/courses";
import {
  CERTIFICATION_AGENCIES,
  type CertificationAgency,
} from "@/lib/api/certifications";

// Human labels for a course's status. Derived in the browser rather than sent by
// the API, the same way `certificationExpiryLabel` is: the wire value is a slug
// chosen for storage, and nothing about "not_passed" belongs on a screen.
const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  incomplete: "Incomplete",
  provisional: "Provisional",
  not_passed: "Not passed",
};

/**
 * Label for a course's status, falling back to the wire value for one this build
 * doesn't know about - the same tolerance `certificationAgencyLabel` and the
 * mixtures table's role badge have, since the API can grow a member before the
 * app ships a label for it, and rendering the slug beats rendering a blank cell.
 */
export function courseStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return COURSE_STATUS_LABELS[status as CourseStatus] ?? status;
}

/**
 * Which `Badge` variant a status wears.
 *
 * The distinction that has to survive is completed-versus-not: `default` is the
 * only variant carrying the primary colour, so the one outcome a diver scans for
 * cannot be confused with the five that mean the course is still open or went
 * wrong. Beyond that the grouping is by how much attention the state wants -
 * `not_passed` is the only one worth the destructive red, and the two states that
 * mean "unfinished business" share the warning amber. An unknown status reads as
 * `outline`, which is the neutral one.
 */
export function courseStatusBadgeVariant(
  status: string | null | undefined,
): "default" | "secondary" | "warning" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "default";
    case "in_progress":
      return "secondary";
    case "incomplete":
    case "provisional":
      return "warning";
    case "not_passed":
      return "destructive";
    default:
      return "outline";
  }
}

/** The agency and status vocabularies a diver's own courses actually use. */
export interface CourseVocabulary {
  agencies: CertificationAgency[];
  statuses: CourseStatus[];
}

// Canonical order first, then anything used that this build has no place for -
// a member the API grew before the app did, which `courseStatusLabel` already
// renders rather than blanking. Sorting the strays keeps the tail stable.
function inUse<T extends string>(
  canonical: readonly T[],
  used: Set<string>,
): T[] {
  const known = canonical.filter((value) => used.has(value));
  const strays = [...used]
    .filter((value) => !canonical.includes(value as T))
    .sort() as T[];
  return [...known, ...strays];
}

/**
 * Which agencies and statuses to offer for narrowing a course list: the ones the
 * courses carry, not the nineteen agencies the format defines. A filter row
 * listing agencies the diver has never trained with offers eighteen ways to
 * empty the table.
 *
 * A course need not name an agency, and one that doesn't contributes nothing -
 * there is no "no agency" filter to offer, since the API's `agency` takes a
 * member of the set or nothing at all.
 */
export function courseVocabulary(courses: readonly Course[]): CourseVocabulary {
  const agencies = new Set<string>();
  const statuses = new Set<string>();

  for (const course of courses) {
    if (course.agency) agencies.add(course.agency);
    if (course.status) statuses.add(course.status);
  }

  return {
    agencies: inUse(CERTIFICATION_AGENCIES, agencies),
    statuses: inUse(COURSE_STATUSES, statuses),
  };
}
