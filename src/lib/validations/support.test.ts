import { describe, expect, it } from "vitest";
import { contactSchema } from "./contact";

const valid = {
  name: "Jacques Cousteau",
  email: "jacques@example.com",
  category: "import" as const,
  subject: "Suunto export won't import",
  message: "The JSON my Ocean exports is rejected with a parse error.",
};

const firstIssue = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) => result.error?.issues[0];

describe("contactSchema", () => {
  it("accepts a complete message", () => {
    expect(contactSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a name", () => {
    const result = contactSchema.safeParse({ ...valid, name: "" });

    expect(result.success).toBe(false);
    expect(firstIssue(result)?.message).toBe("Please tell us who you are");
  });

  it("requires a valid email, since it's the only way to reply", () => {
    expect(
      contactSchema.safeParse({ ...valid, email: "jacques@" }).success,
    ).toBe(false);
  });

  it("rejects a category the API doesn't know", () => {
    // The vocabulary is closed on both sides - an unknown slug is a 422, and the
    // subject line of the forwarded email is derived from it server-side.
    expect(
      contactSchema.safeParse({ ...valid, category: "partnership" }).success,
    ).toBe(false);
  });

  it("rejects a one-word message", () => {
    const result = contactSchema.safeParse({ ...valid, message: "broken" });

    expect(result.success).toBe(false);
    expect(firstIssue(result)?.message).toBe("Please add a little more detail");
  });

  it("mirrors the API's upper bounds rather than discovering them via a 422", () => {
    expect(
      contactSchema.safeParse({ ...valid, subject: "s".repeat(151) }).success,
    ).toBe(false);
    expect(
      contactSchema.safeParse({ ...valid, message: "m".repeat(5001) }).success,
    ).toBe(false);
    expect(
      contactSchema.safeParse({ ...valid, name: "n".repeat(101) }).success,
    ).toBe(false);
  });
});
