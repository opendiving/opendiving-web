import type { CourseStatus } from "@/lib/api/courses";

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
