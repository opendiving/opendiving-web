import { z } from "zod";

import type { UpdateProfileData, User } from "@/lib/api/auth";

/**
 * Every plain field of the signed-in diver's account that a form here can edit, in the
 * order they are rendered.
 *
 * `PATCH /user` is `extra="forbid"` with these lengths declared, so an over-long value
 * is a 422 rather than a truncation, and the bounds and messages exist here once.
 *
 * Absent on purpose: `email`, which needs the new address confirmed first
 * (`emailChangeSchema`); `units`, the three email switches and
 * `dive_form_hidden_fields`, which are not text boxes; and the check-in details, which
 * are an object of their own (`validations/checkin-details.ts`).
 */
export const USER_FIELDS = ["name", "username"] as const;

export type UserFieldKey = (typeof USER_FIELDS)[number];

/** Every field is a string in form state. */
export type UserFieldValues = Record<UserFieldKey, string>;

/** Each field's schema, which the sheet's About You dialog borrows for the name. */
export const USER_FIELD_SCHEMAS: Record<UserFieldKey, z.ZodString> = {
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(30, "Name must not exceed 30 characters"),
  username: z
    .string()
    .min(2, "Username must be at least 2 characters")
    .max(20, "Username must not exceed 20 characters")
    .regex(
      /^[a-z0-9]+$/,
      "Username can only contain lowercase letters and numbers",
    ),
};

/** A resolver schema for exactly the fields a form is showing. */
export function userFieldsSchema(fields: readonly UserFieldKey[]) {
  return z.object(
    Object.fromEntries(
      fields.map((field) => [field, USER_FIELD_SCHEMAS[field]]),
    ),
  );
}

/** The stored record as a form holds it: `null` and absent both become `""`. */
export function userFieldsFromUser(user: User): UserFieldValues {
  return {
    name: user.name ?? "",
    username: user.username ?? "",
  };
}

/** What a form holds before the account has loaded. */
export const EMPTY_USER_FIELDS: UserFieldValues = { name: "", username: "" };

/**
 * The `PATCH /user` body for a form showing `fields`: those keys and no others, trimmed.
 * Both are required, so neither has a null to clear it to, and the schema has already
 * refused an empty one by the time this runs.
 */
export function userFieldsUpdate(
  fields: readonly UserFieldKey[],
  values: UserFieldValues,
): UpdateProfileData {
  const update: UpdateProfileData = {};
  for (const field of fields) update[field] = values[field].trim();
  return update;
}
