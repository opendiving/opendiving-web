import type {
  ImportCheckInDetail,
  ImportCheckInDetailKey,
  ImportCheckInSubmission,
  ImportPortraitChoice,
  ImportPortraitOffer,
  ImportReport,
} from "@/lib/api/logbook-import";
import { formatDateOnly } from "@/lib/date-time";
import {
  EMERGENCY_CONTACT_FIELDS,
  EMPTY_USER_FIELDS,
  INSURANCE_FIELDS,
  userFieldsUpdate,
  type UserFieldKey,
  type UserFieldValues,
} from "@/lib/validations/user-fields";

/**
 * The form module's fields each check-in fact is held in.
 *
 * The import preview edits a fact in the same fields `/settings` does, so a value
 * is bounded, anchored and cleared by one set of rules wherever it is typed.
 */
export const CHECK_IN_DETAIL_FIELDS: Record<
  ImportCheckInDetailKey,
  readonly UserFieldKey[]
> = {
  born_on: ["date_of_birth"],
  phone: ["phone"],
  emergency_contact: EMERGENCY_CONTACT_FIELDS,
  insurance: INSURANCE_FIELDS,
};

export const CHECK_IN_DETAIL_LABELS: Record<ImportCheckInDetailKey, string> = {
  born_on: "Date of birth",
  phone: "Phone number",
  emergency_contact: "Emergency contact",
  insurance: "Dive insurance",
};

// One side of a fact as the form's fields hold it, `""` for anything unset.
function asFields(
  entry: ImportCheckInDetail,
  side: "account" | "proposed",
): Partial<UserFieldValues> {
  switch (entry.detail) {
    case "born_on":
      return { date_of_birth: entry[side] ?? "" };
    case "phone":
      return { phone: entry[side] ?? "" };
    case "emergency_contact": {
      const contact = entry[side];
      return {
        emergency_contact_name: contact?.name ?? "",
        emergency_contact_phone: contact?.phone ?? "",
        emergency_contact_relationship: contact?.relationship ?? "",
      };
    }
    case "insurance": {
      const insurance = entry[side];
      return {
        insurance_provider: insurance?.provider ?? "",
        insurance_policy_number: insurance?.number ?? "",
        insurance_expires_on: insurance?.expires_on ?? "",
      };
    }
  }
}

/** The form's starting values: every fact the document carries, as proposed. */
export function checkInProposalValues(
  details: readonly ImportCheckInDetail[],
): UserFieldValues {
  return Object.assign(
    { ...EMPTY_USER_FIELDS },
    ...details.map((entry) => asFields(entry, "proposed")),
  );
}

/** What the account holds of one fact, as one line, or `null` when it holds none. */
export function checkInAccountSummary(
  entry: ImportCheckInDetail,
): string | null {
  const values = asFields(entry, "account");
  const parts = CHECK_IN_DETAIL_FIELDS[entry.detail].flatMap((field) => {
    const value = values[field]?.trim();
    if (!value) return [];
    if (field === "date_of_birth") return [formatDateOnly(value)];
    if (field === "insurance_expires_on")
      return [`expires ${formatDateOnly(value)}`];
    return [value];
  });
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The apply's `check_in_details` body: every fact not in `kept`, as the form holds it.
 *
 * A kept fact is left out, which is what makes the API leave it alone. An emptied
 * one goes as `null`, which clears it - trimmed and nulled by `userFieldsUpdate`, the
 * same rule a `/settings` save follows.
 */
export function checkInSubmission(
  details: readonly ImportCheckInDetail[],
  kept: ReadonlySet<ImportCheckInDetailKey>,
  values: UserFieldValues,
): ImportCheckInSubmission {
  const submission: ImportCheckInSubmission = {};
  for (const { detail } of details) {
    if (kept.has(detail)) continue;
    const update = userFieldsUpdate(CHECK_IN_DETAIL_FIELDS[detail], values);
    switch (detail) {
      case "born_on":
        submission.born_on = update.date_of_birth ?? null;
        break;
      case "phone":
        submission.phone = update.phone ?? null;
        break;
      case "emergency_contact": {
        const contact = {
          name: update.emergency_contact_name ?? null,
          phone: update.emergency_contact_phone ?? null,
          relationship: update.emergency_contact_relationship ?? null,
        };
        submission.emergency_contact = Object.values(contact).some(Boolean)
          ? contact
          : null;
        break;
      }
      case "insurance": {
        const insurance = {
          provider: update.insurance_provider ?? null,
          number: update.insurance_policy_number ?? null,
          expires_on: update.insurance_expires_on ?? null,
        };
        submission.insurance = Object.values(insurance).some(Boolean)
          ? insurance
          : null;
        break;
      }
    }
  }
  return submission;
}

/**
 * The apply's `portrait` field: the choice, with the account digest the preview
 * showed whichever way it went, or `undefined` when nothing was offered.
 */
export function portraitChoice(
  offer: ImportPortraitOffer | null,
  kept: boolean,
): ImportPortraitChoice | undefined {
  if (!offer) return undefined;
  return {
    choice: kept ? "keep" : "take",
    account_sha256: offer.account_sha256,
  };
}

/** Whether an apply changed any of the account's check-in facts or its portrait. */
export function checkInWasWritten(report: ImportReport): boolean {
  return report.notes.some((note) => note.code === "check_in_detail_written");
}
