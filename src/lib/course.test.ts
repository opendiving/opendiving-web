import { describe, expect, it } from "vitest";
import { COURSE_STATUSES, type Course } from "@/lib/api/courses";
import {
  courseStatusBadgeVariant,
  courseStatusLabel,
  courseVocabulary,
} from "@/lib/course";

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

describe("courseVocabulary", () => {
  const course = (fields: Partial<Course>): Course =>
    ({
      uuid: crypto.randomUUID(),
      name: "Nitrox",
      status: "completed",
      user_uuid: "diver",
      created_at: "2025-01-01T00:00:00Z",
      ...fields,
    }) as Course;

  it("offers only the agencies the courses carry", () => {
    const { agencies } = courseVocabulary([
      course({ agency: "sdi" }),
      course({ agency: "padi" }),
      course({ agency: "padi" }),
    ]);

    expect(agencies).toEqual(["padi", "sdi"]);
  });

  it("orders both lists canonically rather than by first appearance", () => {
    // `padi` is declared before `sdi`, and `planned` before `completed`, so what
    // the diver logged first does not decide what the picker offers first.
    const { agencies, statuses } = courseVocabulary([
      course({ agency: "sdi", status: "completed" }),
      course({ agency: "padi", status: "planned" }),
    ]);

    expect(agencies).toEqual(["padi", "sdi"]);
    expect(statuses).toEqual(["planned", "completed"]);
  });

  it("passes over a course that names no agency", () => {
    const { agencies, statuses } = courseVocabulary([
      course({ agency: null, status: "in_progress" }),
    ]);

    expect(agencies).toEqual([]);
    expect(statuses).toEqual(["in_progress"]);
  });

  // The same tolerance `courseStatusLabel` has: the API can grow a member before
  // this build ships a label for it, and a course wearing one is still a course
  // the diver may want to filter to.
  it("keeps a status this build does not know, after the ones it does", () => {
    const { statuses } = courseVocabulary([
      course({ status: "deferred" as Course["status"] }),
      course({ status: "completed" }),
    ]);

    expect(statuses).toEqual(["completed", "deferred"]);
  });

  it("answers an empty logbook with empty lists", () => {
    expect(courseVocabulary([])).toEqual({ agencies: [], statuses: [] });
  });
});
