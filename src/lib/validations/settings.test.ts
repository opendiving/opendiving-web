import { describe, expect, it } from "vitest";
import { passwordSchema, profileSchema } from "./settings";

describe("profileSchema", () => {
  const validInput = {
    name: "Jane Doe",
    username: "janedoe",
    email: "jane@example.com",
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

  it("rejects an invalid email address", () => {
    const result = profileSchema.safeParse({
      ...validInput,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});

describe("passwordSchema", () => {
  const validInput = {
    currentPassword: "OldPassw0rd!",
    newPassword: "Passw0rd!",
    confirmPassword: "Passw0rd!",
  };

  it("accepts a fully valid password change payload", () => {
    expect(passwordSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects an empty current password", () => {
    const result = passwordSchema.safeParse({
      ...validInput,
      currentPassword: "",
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["shorter than 8 characters", "Pw0!"],
    ["missing a number", "Password!"],
    ["missing an uppercase letter", "password0!"],
    ["missing a lowercase letter", "PASSWORD0!"],
    ["missing a special character", "Password0"],
  ])("rejects a new password %s", (_label, newPassword) => {
    const result = passwordSchema.safeParse({
      ...validInput,
      newPassword,
      confirmPassword: newPassword,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when confirmPassword does not match newPassword", () => {
    const result = passwordSchema.safeParse({
      ...validInput,
      confirmPassword: "Different0!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });
});
