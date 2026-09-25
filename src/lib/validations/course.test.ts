import { describe, expect, it } from "vitest";
import { courseSchema } from "./course";

const valid = {
  name: "Advanced Nitrox + Decompression Procedures",
  agency: "tdi" as const,
  status: "completed" as const,
};

const firstIssue = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) => result.error?.issues[0];

describe("courseSchema", () => {
  it("accepts a minimal course", () => {
    expect(courseSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a name", () => {
    const result = courseSchema.safeParse({ ...valid, name: "" });

    expect(result.success).toBe(false);
    expect(firstIssue(result)?.message).toBe("Course name is required");
  });

  it("accepts a course with no agency", () => {
    // A course run by a private instructor names none, and `null` is what the
    // dialog sends for it - the API's own "not set" for this column.
    expect(courseSchema.safeParse({ ...valid, agency: null }).success).toBe(
      true,
    );
  });

  it("rejects an unknown agency", () => {
    // The vocabulary is closed on both sides and has no DB CHECK behind it, so a
    // typo that got through here would be stored and shown as a raw slug.
    expect(
      courseSchema.safeParse({ ...valid, agency: "padi-international" })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(
      courseSchema.safeParse({ ...valid, status: "deferred" }).success,
    ).toBe(false);
  });

  describe("agency_other pairing", () => {
    it("requires a name when the agency is 'other'", () => {
      const result = courseSchema.safeParse({ ...valid, agency: "other" });

      expect(result.success).toBe(false);
      expect(firstIssue(result)?.path).toEqual(["agency_other"]);
    });

    it("rejects a whitespace-only agency name", () => {
      expect(
        courseSchema.safeParse({
          ...valid,
          agency: "other",
          agency_other: "   ",
        }).success,
      ).toBe(false);
    });

    it("accepts 'other' with a name", () => {
      expect(
        courseSchema.safeParse({
          ...valid,
          agency: "other",
          agency_other: "FFESSM",
        }).success,
      ).toBe(true);
    });

    it("asks for no agency name when there is no agency", () => {
      // Same tolerance as a named agency: the refine fires only on "other", and
      // `CourseDialog`'s submit mapping nulls the stale name rather than the
      // schema refusing the diver's own edit mid-flight.
      expect(
        courseSchema.safeParse({
          ...valid,
          agency: null,
          agency_other: "FFESSM",
        }).success,
      ).toBe(true);
    });

    it("leaves a stale agency name alone for a named agency", () => {
      // The form keeps the typed name in state when the agency is switched back,
      // and the API would refuse it - `CourseDialog`'s submit mapping nulls it
      // rather than the schema refusing the diver's own edit mid-flight.
      expect(
        courseSchema.safeParse({ ...valid, agency_other: "FFESSM" }).success,
      ).toBe(true);
    });
  });

  describe("dates", () => {
    it("accepts a course with no dates at all", () => {
      // A `planned` course has none yet, which is why both columns are nullable.
      expect(
        courseSchema.safeParse({
          ...valid,
          status: "planned",
          start_date: "",
          end_date: "",
        }).success,
      ).toBe(true);
    });

    it("accepts an end date on the start date", () => {
      expect(
        courseSchema.safeParse({
          ...valid,
          start_date: "2026-03-02",
          end_date: "2026-03-02",
        }).success,
      ).toBe(true);
    });

    it("rejects an end date before the start date", () => {
      const result = courseSchema.safeParse({
        ...valid,
        start_date: "2026-03-06",
        end_date: "2026-03-02",
      });

      expect(result.success).toBe(false);
      expect(firstIssue(result)?.path).toEqual(["end_date"]);
    });

    it("accepts either date alone", () => {
      expect(
        courseSchema.safeParse({ ...valid, start_date: "2026-03-02" }).success,
      ).toBe(true);
      expect(
        courseSchema.safeParse({ ...valid, end_date: "2026-03-06" }).success,
      ).toBe(true);
    });

    it("rejects a date that isn't YYYY-MM-DD", () => {
      expect(
        courseSchema.safeParse({ ...valid, start_date: "02/03/2026" }).success,
      ).toBe(false);
    });
  });

  describe("lengths mirroring the API's columns", () => {
    it("rejects an over-long instructor number", () => {
      expect(
        courseSchema.safeParse({ ...valid, instructor_number: "1".repeat(65) })
          .success,
      ).toBe(false);
    });
  });

  it("takes the contact as a uuid, or null for none", () => {
    // A picker's value, not text: the dive center's name lives on the contact.
    expect(
      courseSchema.safeParse({ ...valid, contact_uuid: "contact-1" }).success,
    ).toBe(true);
    expect(
      courseSchema.safeParse({ ...valid, contact_uuid: null }).success,
    ).toBe(true);
  });
});
