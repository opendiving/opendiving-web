import { describe, expect, it } from "vitest";
import { emailChangeSchema, profileSchema } from "./settings";

describe("profileSchema", () => {
  const validInput = {
    name: "Jane Doe",
    username: "janedoe",
  };

  it("accepts a fully valid profile payload", () => {
    expect(profileSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = profileSchema.safeParse({ ...validInput, name: "J" });
    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 30 characters", () => {
    const result = profileSchema.safeParse({
      ...validInput,
      name: "a".repeat(31),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a username with uppercase letters", () => {
    const result = profileSchema.safeParse({
      ...validInput,
      username: "JaneDoe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a username with special characters", () => {
    const result = profileSchema.safeParse({
      ...validInput,
      username: "jane_doe",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a username with only lowercase letters and numbers", () => {
    const result = profileSchema.safeParse({
      ...validInput,
      username: "jane123",
    });
    expect(result.success).toBe(true);
  });
});

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
