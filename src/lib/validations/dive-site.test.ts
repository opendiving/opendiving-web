import { describe, expect, it } from "vitest";
import { diveSiteFormSchema } from "./dive-site";

describe("diveSiteFormSchema", () => {
  it("accepts a valid dive site with only the required name", () => {
    expect(diveSiteFormSchema.safeParse({ name: "Blue Hole" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(diveSiteFormSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    expect(diveSiteFormSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a name longer than 255 characters", () => {
    const result = diveSiteFormSchema.safeParse({ name: "a".repeat(256) });
    expect(result.success).toBe(false);
  });

  it("accepts optional location/notes", () => {
    const result = diveSiteFormSchema.safeParse({
      name: "Blue Hole",
      location: "Dahab, Egypt",
      notes: "Famous for its arch",
    });
    expect(result.success).toBe(true);
  });

  it("rejects notes longer than the max length", () => {
    const result = diveSiteFormSchema.safeParse({
      name: "Blue Hole",
      notes: "a".repeat(63207),
    });
    expect(result.success).toBe(false);
  });
});
