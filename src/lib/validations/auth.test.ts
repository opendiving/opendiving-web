import { describe, expect, it } from "vitest";
import { emailAuthSchema, profileCompletionSchema } from "./auth";

describe("emailAuthSchema", () => {
  it("accepts a valid email address", () => {
    const result = emailAuthSchema.safeParse({ email: "diver@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email address", () => {
    const result = emailAuthSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty email address", () => {
    const result = emailAuthSchema.safeParse({ email: "" });
    expect(result.success).toBe(false);
  });
});

describe("profileCompletionSchema", () => {
  const validInput = {
    name: "Jane Doe",
    username: "janedoe",
  };

  it("accepts a fully valid profile-completion payload", () => {
    expect(profileCompletionSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = profileCompletionSchema.safeParse({
      ...validInput,
      name: "J",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 30 characters", () => {
    const result = profileCompletionSchema.safeParse({
      ...validInput,
      name: "a".repeat(31),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a username with uppercase letters", () => {
    const result = profileCompletionSchema.safeParse({
      ...validInput,
      username: "JaneDoe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a username with special characters", () => {
    const result = profileCompletionSchema.safeParse({
      ...validInput,
      username: "jane_doe",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a username with only lowercase letters and numbers", () => {
    const result = profileCompletionSchema.safeParse({
      ...validInput,
      username: "jane123",
    });
    expect(result.success).toBe(true);
  });
});
