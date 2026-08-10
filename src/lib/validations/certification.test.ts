import { describe, expect, it } from "vitest";
import { certificationSchema } from "./certification";

const valid = {
  agency: "padi" as const,
  name: "Advanced Open Water Diver",
};

const firstIssue = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues[0];

describe("certificationSchema", () => {
  it("accepts a minimal certification", () => {
    expect(certificationSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a name", () => {
    const result = certificationSchema.safeParse({ ...valid, name: "" });

    expect(result.success).toBe(false);
    expect(firstIssue(result)?.message).toBe("Certification name is required");
  });

  it("rejects an unknown agency", () => {
    // The vocabulary is closed on both sides; there is no DB CHECK behind it, so a
    // typo that got through here would be stored and shown as a raw slug.
    expect(
      certificationSchema.safeParse({ ...valid, agency: "padi-international" })
        .success,
    ).toBe(false);
  });

  describe("agency_other pairing", () => {
    it("requires a name when the agency is 'other'", () => {
      const result = certificationSchema.safeParse({
        ...valid,
        agency: "other",
      });

      expect(result.success).toBe(false);
      expect(firstIssue(result)?.path).toEqual(["agency_other"]);
    });

    it("rejects a whitespace-only agency name", () => {
      expect(
        certificationSchema.safeParse({
          ...valid,
          agency: "other",
          agency_other: "   ",
        }).success,
      ).toBe(false);
    });

    it("accepts 'other' with a name", () => {
      expect(
        certificationSchema.safeParse({
          ...valid,
          agency: "other",
          agency_other: "FFESSM",
        }).success,
      ).toBe(true);
    });

    it("caps the agency name at 64 characters", () => {
      expect(
        certificationSchema.safeParse({
          ...valid,
          agency: "other",
          agency_other: "a".repeat(65),
        }).success,
      ).toBe(false);
    });
  });

  describe("dates", () => {
    it("accepts a bare YYYY-MM-DD", () => {
      expect(
        certificationSchema.safeParse({ ...valid, certified_on: "2019-06-14" })
          .success,
      ).toBe(true);
    });

    it("accepts the empty string a cleared date input holds", () => {
      // The dialog maps this back to `null` on submit; rejecting it here would make
      // clearing a date impossible.
      expect(
        certificationSchema.safeParse({
          ...valid,
          certified_on: "",
          expires_on: "",
        }).success,
      ).toBe(true);
    });

    it("rejects a non-ISO date", () => {
      expect(
        certificationSchema.safeParse({ ...valid, certified_on: "14/06/2019" })
          .success,
      ).toBe(false);
    });

    it("rejects an expiry before the certification date", () => {
      const result = certificationSchema.safeParse({
        ...valid,
        certified_on: "2019-06-14",
        expires_on: "2018-01-01",
      });

      expect(result.success).toBe(false);
      expect(firstIssue(result)?.path).toEqual(["expires_on"]);
    });

    it("allows an expiry on the same day as the certification", () => {
      expect(
        certificationSchema.safeParse({
          ...valid,
          certified_on: "2019-06-14",
          expires_on: "2019-06-14",
        }).success,
      ).toBe(true);
    });

    it("does not compare dates when only one is given", () => {
      expect(
        certificationSchema.safeParse({ ...valid, expires_on: "2018-01-01" })
          .success,
      ).toBe(true);
    });
  });

  describe("length limits", () => {
    it.each([
      ["name", 256],
      ["certification_number", 65],
      ["instructor_name", 256],
      ["instructor_number", 65],
      ["training_center", 256],
      ["notes", 10001],
    ])("rejects an over-long %s", (field, length) => {
      expect(
        certificationSchema.safeParse({
          ...valid,
          [field]: "a".repeat(length),
        }).success,
      ).toBe(false);
    });
  });
});
