import { describe, expect, it } from "vitest";
import {
  carriedPeople,
  joinCourseInstructor,
  mergePeople,
  splitCourseInstructor,
} from "./people";

const BUDDY = { person_uuid: "p-buddy", role: "buddy" };
const THERE = { person_uuid: "p-there", role: null };
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

describe("carriedPeople", () => {
  it("carries the last dive's buddies, and whoever was simply there", () => {
    expect(
      carriedPeople({
        lastDive: { people: [BUDDY, THERE], course_uuid: null },
      }),
    ).toEqual([BUDDY, THERE]);
  });

  it("leaves a course's instructor and students on the course", () => {
    // The first fun dive after a course: last week's instructor is not on it.
    expect(
      carriedPeople({
        lastDive: {
          people: [INSTRUCTOR, BUDDY, STUDENT],
          course_uuid: "course-1",
        },
      }),
    ).toEqual([BUDDY]);
  });

  it("carries them onto the next dive of the same course", () => {
    expect(
      carriedPeople({
        lastDive: { people: [INSTRUCTOR, STUDENT], course_uuid: "course-1" },
        courseUuid: "course-1",
      }),
    ).toEqual([INSTRUCTOR, STUDENT]);
  });

  it("does not carry them onto a dive of another course", () => {
    expect(
      carriedPeople({
        lastDive: { people: [INSTRUCTOR], course_uuid: "course-1" },
        courseUuid: "course-2",
      }),
    ).toEqual([]);
  });

  it("puts the course's own people first, with their roles", () => {
    // "Log a dive for this course": the course's people arrive as the course
    // has them, and today's buddy from the last dive comes along behind them.
    expect(
      carriedPeople({
        lastDive: {
          people: [{ person_uuid: "p-instructor", role: "buddy" }, BUDDY],
          course_uuid: null,
        },
        courseUuid: "course-1",
        coursePeople: [INSTRUCTOR, STUDENT],
      }),
    ).toEqual([INSTRUCTOR, STUDENT, BUDDY]);
  });

  it("is nobody with no last dive and no course", () => {
    expect(carriedPeople({})).toEqual([]);
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
