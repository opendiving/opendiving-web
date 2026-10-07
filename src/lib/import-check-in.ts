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
  checkinDetailsPatch,
  contactFormValue,
  EMPTY_CHECKIN_FORM_VALUES,
  policyFormValue,
  type CheckinDetailsFormValues,
} from "@/lib/validations/checkin-details";

// Each detail is keyed by the member of the check-in details it is, so the preview
// edits it in the field `/settings` edits it in, bounded and cleared by one set of
// rules wherever it is typed.
export const CHECK_IN_DETAIL_LABELS: Record<ImportCheckInDetailKey, string> = {
  email: "Email",
  phone: "Phone number",
  date_of_birth: "Date of birth",
  emergency_contacts: "Emergency contacts",
  insurance_policies: "Insurance policies",
};

// One side of a detail as the form holds it, `""` for anything unset.
function asFormValue(
  entry: ImportCheckInDetail,
  side: "account" | "proposed",
): Partial<CheckinDetailsFormValues> {
  switch (entry.detail) {
    case "email":
    case "phone":
    case "date_of_birth":
      return { [entry.detail]: entry[side] ?? "" };
    case "emergency_contacts":
      return { emergency_contacts: entry[side].map(contactFormValue) };
    case "insurance_policies":
      return { insurance_policies: entry[side].map(policyFormValue) };
  }
}

/** The form's starting values: every detail the document carries, as proposed. */
export function checkInProposalValues(
  details: readonly ImportCheckInDetail[],
): CheckinDetailsFormValues {
  return Object.assign(
    { ...EMPTY_CHECKIN_FORM_VALUES },
    ...details.map((entry) => asFormValue(entry, "proposed")),
  );
}

const joined = (parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(" · ");

/** What the account holds of one detail, as one line, or `null` when it holds none. */
export function checkInAccountSummary(
  entry: ImportCheckInDetail,
): string | null {
  switch (entry.detail) {
    case "email":
    case "phone":
      return entry.account || null;
    case "date_of_birth":
      return entry.account ? formatDateOnly(entry.account) : null;
    case "emergency_contacts":
      return (
        entry.account
          .map((contact) =>
            joined([contact.name, contact.phone, contact.relationship]),
          )
          .join("; ") || null
      );
    case "insurance_policies":
      return (
        entry.account
          .map((policy) =>
            joined([
              policy.provider,
              policy.number,
              policy.expires_on &&
                `expires ${formatDateOnly(policy.expires_on)}`,
            ]),
          )
          .join("; ") || null
      );
  }
}

/**
 * The apply's `check_in_details` body: every detail not in `kept`, as the form holds
 * it. A kept detail is left out, which is what makes the API leave it alone; an
 * emptied scalar goes as `null` and an emptied list as `[]`, which clear it - the
 * same rule a `/settings` save follows, through the same `checkinDetailsPatch`.
 */
export function checkInSubmission(
  details: readonly ImportCheckInDetail[],
  kept: ReadonlySet<ImportCheckInDetailKey>,
  values: CheckinDetailsFormValues,
): ImportCheckInSubmission {
  return checkinDetailsPatch(
    details.map(({ detail }) => detail).filter((detail) => !kept.has(detail)),
    values,
  );
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

/** Whether an apply changed any of the account's check-in details or its portrait. */
export function checkInWasWritten(report: ImportReport): boolean {
  return report.notes.some((note) => note.code === "check_in_detail_written");
}
