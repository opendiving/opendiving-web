import { z } from "zod";

import {
  EMPTY_CHECKIN_DETAILS,
  MAX_EMERGENCY_CONTACTS,
  MAX_INSURANCE_POLICIES,
  type CheckinDetails,
  type CheckinDetailsUpdate,
  type EmergencyContact,
  type InsurancePolicy,
} from "@/lib/api/checkin-details";
import { todayIsoDate } from "@/lib/gear-service";

// Every value is a string in form state, `""` being "not set": react-hook-form
// re-displays a field's default the moment its value resolves to
// `undefined`, and `""` is the one empty a text box and a `DatePicker` both speak.
// `checkinDetailsPatch` turns it back into the `null` the API clears with. The rows are
// `type`s rather than interfaces so they satisfy the list field's string record.
export type EmergencyContactFormValue = {
  name: string;
  phone: string;
  relationship: string;
};

export type InsurancePolicyFormValue = {
  provider: string;
  number: string;
  expires_on: string;
};

export interface CheckinDetailsFormValues {
  email: string;
  phone: string;
  date_of_birth: string;
  emergency_contacts: EmergencyContactFormValue[];
  insurance_policies: InsurancePolicyFormValue[];
}

export type CheckinMemberKey = keyof CheckinDetailsFormValues;

/**
 * The three groups every surface edits, named once so a dialog on `/checkin`, a card
 * on `/settings` and the bell cannot disagree about which members are "insurance". A
 * surface sends its group's keys and no other, so a stale copy elsewhere can revert
 * nothing outside the group the diver is looking at.
 */
export const CHECKIN_GROUPS = {
  about: ["date_of_birth", "phone", "email"],
  insurance: ["insurance_policies"],
  emergency: ["emergency_contacts"],
} as const satisfies Record<string, readonly CheckinMemberKey[]>;

export type CheckinGroup = keyof typeof CHECKIN_GROUPS;

// Bare "YYYY-MM-DD", with `""` for a cleared field - a union rather than a
// `.transform()`, which would change what `z.input<>` infers and break the form's
// field types (see DECISIONS.md).
const optionalDate = z.union([
  z.literal(""),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date"),
]);

// The API's bounds, which are DiveJSON's for the member each travels as. Over-long is
// a 422 there rather than a truncation, so it is caught in the field here.
const emergencyContactSchema = z.object({
  name: z
    .string()
    .max(255, "Name cannot exceed 255 characters")
    .refine((value) => value.trim() !== "", "Enter who to call"),
  phone: z.string().max(32, "Phone number cannot exceed 32 characters"),
  relationship: z.string().max(64, "Relationship cannot exceed 64 characters"),
});

const insurancePolicySchema = z.object({
  provider: z
    .string()
    .max(255, "Provider cannot exceed 255 characters")
    .refine((value) => value.trim() !== "", "Enter the provider"),
  number: z.string().max(64, "Policy number cannot exceed 64 characters"),
  expires_on: optionalDate,
});

const MEMBER_SCHEMAS: Record<CheckinMemberKey, z.ZodTypeAny> = {
  email: z
    .string()
    .max(255, "Email cannot exceed 255 characters")
    .refine(
      (value) => !value.trim() || z.email().safeParse(value.trim()).success,
      "Please enter a valid email address",
    ),
  phone: z.string().max(32, "Phone number cannot exceed 32 characters"),
  // Today itself is accepted, as it is there.
  date_of_birth: optionalDate.refine(
    (value) => value <= todayIsoDate(),
    "Date of birth cannot be in the future",
  ),
  emergency_contacts: z
    .array(emergencyContactSchema)
    .max(
      MAX_EMERGENCY_CONTACTS,
      `At most ${MAX_EMERGENCY_CONTACTS} emergency contacts`,
    ),
  insurance_policies: z
    .array(insurancePolicySchema)
    .max(
      MAX_INSURANCE_POLICIES,
      `At most ${MAX_INSURANCE_POLICIES} insurance policies`,
    ),
};

/**
 * A resolver schema for exactly the members a form is showing, so a dialog about
 * insurance cannot fail on a stored value it never showed.
 */
export function checkinDetailsSchema(members: readonly CheckinMemberKey[]) {
  return z.object(
    Object.fromEntries(
      members.map((member) => [member, MEMBER_SCHEMAS[member]]),
    ),
  );
}

export const emptyEmergencyContact = (): EmergencyContactFormValue => ({
  name: "",
  phone: "",
  relationship: "",
});

export const emptyInsurancePolicy = (): InsurancePolicyFormValue => ({
  provider: "",
  number: "",
  expires_on: "",
});

export function contactFormValue(
  contact: EmergencyContact,
): EmergencyContactFormValue {
  return {
    name: contact.name,
    phone: contact.phone ?? "",
    relationship: contact.relationship ?? "",
  };
}

export function policyFormValue(
  policy: InsurancePolicy,
): InsurancePolicyFormValue {
  return {
    provider: policy.provider,
    number: policy.number ?? "",
    expires_on: policy.expires_on ?? "",
  };
}

/** The stored object as a form holds it: `null` becomes `""`. */
export function checkinFormValues(
  details: CheckinDetails,
): CheckinDetailsFormValues {
  return {
    email: details.email ?? "",
    phone: details.phone ?? "",
    date_of_birth: details.date_of_birth ?? "",
    emergency_contacts: details.emergency_contacts.map(contactFormValue),
    insurance_policies: details.insurance_policies.map(policyFormValue),
  };
}

/** What a diver who has filled none of this in sees. */
export const EMPTY_CHECKIN_FORM_VALUES = checkinFormValues(
  EMPTY_CHECKIN_DETAILS,
);

const orNull = (value: string) => value.trim() || null;

/**
 * The `PATCH /user/checkin-details` body for a form showing `members`: those keys and
 * no others, trimmed, with `""` sent as an explicit `null` so an emptied member is
 * cleared. A list goes whole, `[]` when the diver removed every row - never `null`,
 * which the API refuses.
 */
export function checkinDetailsPatch(
  members: readonly CheckinMemberKey[],
  values: CheckinDetailsFormValues,
): CheckinDetailsUpdate {
  const patch: CheckinDetailsUpdate = {};
  for (const member of members) {
    switch (member) {
      case "email":
      case "phone":
      case "date_of_birth":
        patch[member] = orNull(values[member]);
        break;
      case "emergency_contacts":
        patch.emergency_contacts = values.emergency_contacts.map((row) => ({
          name: row.name.trim(),
          phone: orNull(row.phone),
          relationship: orNull(row.relationship),
        }));
        break;
      case "insurance_policies":
        patch.insurance_policies = values.insurance_policies.map((row) => ({
          provider: row.provider.trim(),
          number: orNull(row.number),
          expires_on: orNull(row.expires_on),
        }));
        break;
    }
  }
  return patch;
}
