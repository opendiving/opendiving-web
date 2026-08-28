import { describe, expect, it } from "vitest";
import { COURSE_STATUSES } from "@/lib/api/courses";
import { courseStatusBadgeVariant, courseStatusLabel } from "@/lib/course";

describe("courseStatusLabel", () => {
  it("names every status the API can send", () => {
    // Driven off the vocabulary itself rather than a second hand-written list,
    // so a status added to `COURSE_STATUSES` without a label fails here.
    const labels = COURSE_STATUSES.map(courseStatusLabel);

    expect(labels).toEqual([
      "Planned",
      "In progress",
      "Completed",
      "Incomplete",
      "Provisional",
      "Not passed",
    ]);
  });

  it("gives each status a label of its own", () => {
    const labels = COURSE_STATUSES.map(courseStatusLabel);

    expect(new Set(labels).size).toBe(COURSE_STATUSES.length);
  });

  it("falls back to the wire value for a status this build doesn't know", () => {
    expect(courseStatusLabel("deferred")).toBe("deferred");
  });

  it("renders nothing for a missing status", () => {
    expect(courseStatusLabel(null)).toBe("");
    expect(courseStatusLabel(undefined)).toBe("");
  });
});

describe("courseStatusBadgeVariant", () => {
  it("gives `completed` a variant no other status wears", () => {
    // The one distinction that has to hold: an outcome a diver scans for cannot
    // share a badge with the states that mean the course is still open.
    const completed = courseStatusBadgeVariant("completed");
    const others = COURSE_STATUSES.filter(
      (status) => status !== "completed",
    ).map(courseStatusBadgeVariant);

    expect(others).not.toContain(completed);
  });

  it("badges a failed course destructively", () => {
    expect(courseStatusBadgeVariant("not_passed")).toBe("destructive");
  });

  it("falls back to a neutral variant for an unknown status", () => {
    expect(courseStatusBadgeVariant("deferred")).toBe("outline");
    expect(courseStatusBadgeVariant(null)).toBe("outline");
  });
});
