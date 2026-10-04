import { describe, expect, it } from "vitest";
import {
  joinCourseInstructor,
  mergePeople,
  splitCourseInstructor,
} from "./people";

const BUDDY = { person_uuid: "p-buddy", role: "buddy" };
const INSTRUCTOR = { person_uuid: "p-instructor", role: "instructor" };
const STUDENT = { person_uuid: "p-student", role: "student" };

describe("mergePeople", () => {
  it("keeps the first list's reference for a person on both", () => {
    expect(
      mergePeople(
        [{ person_uuid: "p-1", role: "guide" }],
        [{ person_uuid: "p-1", role: "buddy" }, BUDDY],
      ),
    ).toEqual([{ person_uuid: "p-1", role: "guide" }, BUDDY]);
  });
});

describe("splitCourseInstructor and joinCourseInstructor", () => {
  it("takes the first instructor out onto a field of its own", () => {
    const second = { person_uuid: "p-2", role: "instructor" };
    expect(splitCourseInstructor([STUDENT, INSTRUCTOR, second])).toEqual({
      instructorUuid: "p-instructor",
      others: [STUDENT, second],
    });
  });

  it("names no instructor for a course without one", () => {
    expect(splitCourseInstructor([STUDENT])).toEqual({
      instructorUuid: null,
      others: [STUDENT],
    });
    expect(splitCourseInstructor(undefined)).toEqual({
      instructorUuid: null,
      others: [],
    });
  });

  it("puts the instructor back first, as the instructor", () => {
    expect(joinCourseInstructor("p-instructor", [STUDENT])).toEqual([
      INSTRUCTOR,
      STUDENT,
    ]);
    expect(joinCourseInstructor(null, [STUDENT])).toEqual([STUDENT]);
  });

  it("names nobody twice when the instructor is also on the list", () => {
    expect(joinCourseInstructor("p-student", [STUDENT, BUDDY])).toEqual([
      { person_uuid: "p-student", role: "instructor" },
      BUDDY,
    ]);
  });
});
