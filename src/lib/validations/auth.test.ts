import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema } from "./auth";

describe("signInSchema", () => {
  it("accepts a valid username/password pair", () => {
    const result = signInSchema.safeParse({
      username: "diver1",
      password: "anything",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty username", () => {
    const result = signInSchema.safeParse({ username: "", password: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = signInSchema.safeParse({ username: "diver1", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("signUpSchema", () => {
  const validInput = {
    name: "Jane Doe",
    username: "janedoe",
    email: "jane@example.com",
    password: "Passw0rd!",
  };

  it("accepts a fully valid sign-up payload", () => {
    expect(signUpSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = signUpSchema.safeParse({ ...validInput, name: "J" });
    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 30 characters", () => {
    const result = signUpSchema.safeParse({
      ...validInput,
      name: "a".repeat(31),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a username with uppercase letters", () => {
    const result = signUpSchema.safeParse({
      ...validInput,
      username: "JaneDoe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a username with special characters", () => {
    const result = signUpSchema.safeParse({
      ...validInput,
      username: "jane_doe",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a username with only lowercase letters and numbers", () => {
    const result = signUpSchema.safeParse({
      ...validInput,
      username: "jane123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email address", () => {
    const result = signUpSchema.safeParse({
      ...validInput,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["shorter than 8 characters", "Pw0!"],
    ["missing a number", "Password!"],
    ["missing an uppercase letter", "password0!"],
    ["missing a lowercase letter", "PASSWORD0!"],
    ["missing a special character", "Password0"],
  ])("rejects a password %s", (_label, password) => {
    const result = signUpSchema.safeParse({ ...validInput, password });
    expect(result.success).toBe(false);
  });

  it("accepts a password satisfying all complexity rules", () => {
    const result = signUpSchema.safeParse({
      ...validInput,
      password: "Passw0rd!",
    });
    expect(result.success).toBe(true);
  });
});
