import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { requiredName } from "./name";
import { certificationSchema } from "./certification";
import { contactSchema } from "./contact";
import { courseSchema } from "./course";
import { diveSiteFormSchema } from "./dive-site";
import { gearItemSchema, gearSetSchema } from "./gear";
import { personSchema } from "./person";
import { tripFormSchema } from "./trip";

const messages = (schema: z.ZodType, value: string) =>
  schema.safeParse(value).error?.issues.map((issue) => issue.message) ?? [];

describe("requiredName", () => {
  const name = requiredName("Trip name", 10);

  it("refuses an empty name and a name of spaces alone", () => {
    expect(messages(name, "")).toEqual(["Trip name is required"]);
    expect(messages(name, "   ")).toEqual(["Trip name is required"]);
  });

  it("bounds the trimmed name, so padding never pushes one over", () => {
    expect(messages(name, "  0123456789  ")).toEqual([]);
    expect(messages(name, "0123456789X")).toEqual([
      "Trip name cannot exceed 10 characters",
    ]);
  });
});

describe("every required name refuses blanks", () => {
  it.each([
    ["certification", certificationSchema.shape.name],
    ["contact", contactSchema.shape.name],
    ["course", courseSchema.shape.name],
    ["dive site", diveSiteFormSchema.shape.name],
    ["gear item", gearItemSchema.shape.name],
    ["gear set", gearSetSchema.shape.name],
    ["person", personSchema.shape.name],
    ["trip", tripFormSchema.shape.name],
  ])("%s", (_, field) => {
    expect(field.safeParse("   ").success).toBe(false);
    expect(field.safeParse(" Blue Hole ").success).toBe(true);
  });
});
