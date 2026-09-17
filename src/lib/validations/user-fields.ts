import { z } from "zod";

import type { UpdateProfileData, User } from "@/lib/api/auth";
import { todayIsoDate } from "@/lib/gear-service";

/**
 * Every plain field of the signed-in diver's own record that a form here can edit,
 * in the order they are rendered.
 *
 * One list rather than a schema per surface: `/settings` shows them in three cards
 * and `/checkin` in three dialogs, and both are subsets of this. The bounds and the
 * messages therefore exist once - `PATCH /user` is `extra="forbid"` with those
 * lengths declared, so an over-long value is a 422 rather than a truncation, and a
 * second copy of a bound is a second thing to keep in step with the column.
 *
 * Absent on purpose: `email`, which needs the new address confirmed first
 * (`emailChangeSchema`), and `units`, `gear_service_emails` and
 * `dive_form_hidden_fields`, which are not text boxes.
 */
export const USER_FIELDS = [
  "name",
  "username",
  "date_of_birth",
  "phone",
  "insurance_provider",
  "insurance_policy_number",
  "insurance_expires_on",
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_relationship",
] as const;

export type UserFieldKey = (typeof USER_FIELDS)[number];

/**
 * Every field is a string in form state, `""` being "not set".
 *
 * Not `string | null`: react-hook-form re-displays a field's default the moment its
 * value resolves to `undefined`, and `""` is the one empty a text box and a
 * `DatePicker` both already speak. `userFieldsUpdate` turns it back into the `null`
 * the API clears a column with.
 */
export type UserFieldValues = Record<UserFieldKey, string>;

// Bare "YYYY-MM-DD", with `""` for a cleared field - a union rather than a
// `z.preprocess()`/`.transform()`, which would change what `z.input<>` infers and
// break the form's field types (see DECISIONS.md).
const optionalDate = (message: string) =>
  z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message)]);

const FIELD_SCHEMAS: Record<UserFieldKey, z.ZodTypeAny> = {
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
  date_of_birth: optionalDate("Use a valid date"),
  phone: z.string().max(32, "Phone number cannot exceed 32 characters"),
  insurance_provider: z
    .string()
    .max(100, "Provider cannot exceed 100 characters"),
  insurance_policy_number: z
    .string()
    .max(64, "Policy number cannot exceed 64 characters"),
  insurance_expires_on: optionalDate("Use a valid date"),
  emergency_contact_name: z
    .string()
    .max(100, "Name cannot exceed 100 characters"),
  emergency_contact_phone: z
    .string()
    .max(32, "Phone number cannot exceed 32 characters"),
  emergency_contact_relationship: z
    .string()
    .max(50, "Relationship cannot exceed 50 characters"),
};

/**
 * The three groups both surfaces show, named once so a dialog on `/checkin` and a
 * card on `/settings` cannot disagree about which fields are "insurance". The sheet's
 * own sections are these too, which is what makes each section's edit control open
 * exactly what it sits beside.
 */
export const ABOUT_YOU_FIELDS = ["date_of_birth", "phone"] as const;
export const INSURANCE_FIELDS = [
  "insurance_provider",
  "insurance_policy_number",
  "insurance_expires_on",
] as const;
export const EMERGENCY_CONTACT_FIELDS = [
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_relationship",
] as const;

/** Which fields are required, and so cannot be cleared. */
const REQUIRED: ReadonlySet<UserFieldKey> = new Set(["name", "username"]);

/**
 * A resolver schema for exactly the fields a form is showing.
 *
 * Built per form rather than validating the whole record, because the form seeds
 * every field from the account and only renders some: a schema covering all of them
 * would fail a dialog about insurance on a stored name it never showed and the diver
 * cannot reach from there.
 */
export function userFieldsSchema(fields: readonly UserFieldKey[]) {
  const shape = Object.fromEntries(
    fields.map((field) => [field, FIELD_SCHEMAS[field]]),
  );
  const schema = z.object(shape);

  // Mirrors the API's own `field_validator`, so a slipped digit is caught in the
  // field rather than coming back as a 422. Today itself is accepted, as it is
  // there. An object-level refine, unlike a field-level transform, leaves what
  // `z.input<>` infers untouched.
  return fields.includes("date_of_birth")
    ? schema.refine(
        (data) =>
          !data.date_of_birth || String(data.date_of_birth) <= todayIsoDate(),
        {
          message: "Date of birth cannot be in the future",
          path: ["date_of_birth"],
        },
      )
    : schema;
}

/** The stored record as a form holds it: `null` and absent both become `""`. */
export function userFieldsFromUser(user: User): UserFieldValues {
  return {
    name: user.name ?? "",
    username: user.username ?? "",
    date_of_birth: user.date_of_birth ?? "",
    phone: user.phone ?? "",
    insurance_provider: user.insurance_provider ?? "",
    insurance_policy_number: user.insurance_policy_number ?? "",
    insurance_expires_on: user.insurance_expires_on ?? "",
    emergency_contact_name: user.emergency_contact_name ?? "",
    emergency_contact_phone: user.emergency_contact_phone ?? "",
    emergency_contact_relationship: user.emergency_contact_relationship ?? "",
  };
}

/** What a diver who has filled none of this in sees. */
export const EMPTY_USER_FIELDS: UserFieldValues = Object.fromEntries(
  USER_FIELDS.map((field) => [field, ""]),
) as UserFieldValues;

/**
 * The `PATCH /user` body for a form showing `fields`: those keys and no others, with
 * `""` sent as an explicit `null` so a group the diver emptied is actually cleared.
 *
 * Only the fields shown, because a body carrying a key the form never displayed
 * would have this dialog saving a value from somewhere else - and `PATCH /user` is
 * `extra="forbid"`, so the set has to be exact either way.
 */
export function userFieldsUpdate(
  fields: readonly UserFieldKey[],
  values: UserFieldValues,
): UpdateProfileData {
  const update: UpdateProfileData = {};
  for (const field of fields) {
    const trimmed = values[field].trim();
    if (REQUIRED.has(field)) {
      // A required column has no null to clear it to; the schema has already
      // refused an empty one by the time this runs.
      update[field as "name" | "username"] = trimmed;
    } else {
      update[field as Exclude<UserFieldKey, "name" | "username">] =
        trimmed || null;
    }
  }
  return update;
}
