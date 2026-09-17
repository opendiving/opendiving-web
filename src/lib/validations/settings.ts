import { z } from "zod";
import type { UpdateProfileData, User } from "@/lib/api/auth";
import { todayIsoDate } from "@/lib/gear-service";

// Note: no `email` field here - changing an account's email requires confirming
// ownership of the new address first (see `emailChangeSchema` below, and
// `authAPI.requestEmailChange`/`verifyEmailChange`), not a plain field edit.
export const profileSchema = z.object({
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
});

export const emailChangeSchema = z.object({
  newEmail: z.string().email("Please enter a valid email address"),
});

export type ProfileFormData = z.infer<typeof profileSchema>;
export type EmailChangeFormData = z.infer<typeof emailChangeSchema>;

// Bare "YYYY-MM-DD", with `""` for a cleared field - the same shape and the same
// reasoning as `validations/certification.ts`'s dates: a union rather than a
// `z.preprocess()`/`.transform()`, which would change what `z.input<>` infers and
// break the form's field types (see DECISIONS.md).
const optionalDate = (message: string) =>
  z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message)]);

// What a dive shop asks for at the desk, in the API's own form order.
//
// The string bounds are the `user` columns' own. `PATCH /user` is `extra="forbid"`
// with those lengths declared, so an over-long value is a 422 rather than a
// truncation, and the field says so before the round trip.
export const checkInDetailsSchema = z
  .object({
    date_of_birth: optionalDate("Use a valid date"),
    phone: z.string().max(32, "Phone number cannot exceed 32 characters"),
    emergency_contact_name: z
      .string()
      .max(100, "Name cannot exceed 100 characters"),
    emergency_contact_phone: z
      .string()
      .max(32, "Phone number cannot exceed 32 characters"),
    emergency_contact_relationship: z
      .string()
      .max(50, "Relationship cannot exceed 50 characters"),
    insurance_provider: z
      .string()
      .max(100, "Provider cannot exceed 100 characters"),
    insurance_policy_number: z
      .string()
      .max(64, "Policy number cannot exceed 64 characters"),
    insurance_expires_on: optionalDate("Use a valid date"),
  })
  // Mirrors the API's own `field_validator` on `date_of_birth`, so a slipped digit
  // is caught in the field rather than coming back as a 422. Today itself is
  // accepted, as it is there. An object-level refine, unlike a field-level
  // transform, leaves `z.input<>` untouched.
  .refine(
    (data) => !data.date_of_birth || data.date_of_birth <= todayIsoDate(),
    {
      message: "Date of birth cannot be in the future",
      path: ["date_of_birth"],
    },
  );

export type CheckInDetailsInput = z.input<typeof checkInDetailsSchema>;

/** An empty card: what a diver who has filled none of this in sees. */
export const EMPTY_CHECK_IN_DETAILS: CheckInDetailsInput = {
  date_of_birth: "",
  phone: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  emergency_contact_relationship: "",
  insurance_provider: "",
  insurance_policy_number: "",
  insurance_expires_on: "",
};

/** The stored details as the form holds them: `null` and absent both become `""`. */
export function checkInDetailsFromUser(user: User): CheckInDetailsInput {
  return {
    date_of_birth: user.date_of_birth ?? "",
    phone: user.phone ?? "",
    emergency_contact_name: user.emergency_contact_name ?? "",
    emergency_contact_phone: user.emergency_contact_phone ?? "",
    emergency_contact_relationship: user.emergency_contact_relationship ?? "",
    insurance_provider: user.insurance_provider ?? "",
    insurance_policy_number: user.insurance_policy_number ?? "",
    insurance_expires_on: user.insurance_expires_on ?? "",
  };
}

/**
 * The card's `PATCH /user` body: every one of its own fields and nothing else, with
 * `""` sent as an explicit `null` so a group the diver emptied is actually cleared.
 *
 * Each field written out rather than mapped over the object, for the reason
 * "Explicit field construction beats spread-then-override" gives in DECISIONS.md.
 */
export function checkInDetailsUpdate(
  data: CheckInDetailsInput,
): UpdateProfileData {
  return {
    date_of_birth: data.date_of_birth || null,
    phone: data.phone.trim() || null,
    emergency_contact_name: data.emergency_contact_name.trim() || null,
    emergency_contact_phone: data.emergency_contact_phone.trim() || null,
    emergency_contact_relationship:
      data.emergency_contact_relationship.trim() || null,
    insurance_provider: data.insurance_provider.trim() || null,
    insurance_policy_number: data.insurance_policy_number.trim() || null,
    insurance_expires_on: data.insurance_expires_on || null,
  };
}
