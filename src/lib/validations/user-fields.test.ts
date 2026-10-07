import { describe, expect, it } from "vitest";

import {
  userFieldsFromUser,
  userFieldsSchema,
  userFieldsUpdate,
  type UserFieldValues,
} from "./user-fields";
import type { User } from "@/lib/api/auth";

const values = (over: Partial<UserFieldValues> = {}): UserFieldValues => ({
  name: "Jane Doe",
  username: "janedoe",
  ...over,
});

describe("userFieldsSchema", () => {
  const profile = userFieldsSchema(["name", "username"]);

  it("holds the profile bounds it was given", () => {
    expect(profile.safeParse(values()).success).toBe(true);
    expect(profile.safeParse(values({ name: "J" })).success).toBe(false);
    expect(profile.safeParse(values({ name: "a".repeat(31) })).success).toBe(
      false,
    );
    expect(profile.safeParse(values({ username: "JaneDoe" })).success).toBe(
      false,
    );
    expect(profile.safeParse(values({ username: "jane_doe" })).success).toBe(
      false,
    );
    expect(profile.safeParse(values({ username: "jane123" })).success).toBe(
      true,
    );
  });

  it("judges only the fields the form is showing", () => {
    expect(
      userFieldsSchema(["name"]).safeParse(values({ username: "J" })).success,
    ).toBe(true);
  });
});

describe("userFieldsUpdate", () => {
  it("sends the fields shown and no others, trimmed", () => {
    expect(
      userFieldsUpdate(["name"], values({ name: "  Jane  ", username: "x" })),
    ).toEqual({ name: "Jane" });
  });
});

describe("userFieldsFromUser", () => {
  it("reads the account's name and username", () => {
    const user = {
      uuid: "user-1",
      name: "Jane Doe",
      username: "janedoe",
      email: "jane@example.com",
      units: "metric",
      dive_form_hidden_fields: [],
    } as User;

    expect(userFieldsFromUser(user)).toEqual(values());
  });
});
