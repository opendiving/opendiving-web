import { describe, expect, it } from "vitest";
import { emailChangeSchema } from "./settings";

describe("emailChangeSchema", () => {
  it("accepts a valid email address", () => {
    const result = emailChangeSchema.safeParse({ newEmail: "new@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email address", () => {
    const result = emailChangeSchema.safeParse({ newEmail: "not-an-email" });
    expect(result.success).toBe(false);
  });
});
