import type { User } from "@/lib/api/auth";
import type { UserDiveStats } from "@/lib/api/dive-stats";
import { splitStartTime } from "@/lib/date-time";

/**
 * The three figures the summary's "Diving" section prints.
 *
 * `maxDepth` is metric, like every depth this app holds outside `UnitNumberInput`.
 * `lastDiveOn` is a bare "YYYY-MM-DD" rather than the dive's `start_time`: the sheet
 * prints a date, and normalising here is what lets one line render whether the figure
 * came off `/user/dive-stats` or out of the diver's own correction.
 */
export interface DivingFigures {
  totalDives: number | null;
  maxDepth: number | null;
  lastDiveOn: string | null;
}

/** What the log itself says, which is what the dialog opens on. */
export function loggedDivingFigures(
  stats: UserDiveStats | null,
  lastDiveAt: string | null,
): DivingFigures {
  return {
    totalDives: stats?.total_dives ?? null,
    maxDepth: stats?.max_depth ?? null,
    // The dive's own calendar day, in the offset it was logged in - never the
    // reader's. `formatDiveDateTime` is the other half of the same rule.
    lastDiveOn: lastDiveAt
      ? splitStartTime(lastDiveAt).localDateTime.slice(0, 10)
      : null,
  };
}

/** Whether any of the three has something to print. */
export function hasDivingFigures(figures: DivingFigures): boolean {
  return (
    figures.totalDives !== null ||
    figures.maxDepth !== null ||
    figures.lastDiveOn !== null
  );
}

// What a desk asks for, and what counts as having it. An emergency contact is a name
// *and* a number - either alone is not somebody a shop can call - and insurance is
// the provider and the policy number, which is what gets quoted down a phone.
//
// Only what the summary itself prints, so this list and the sheet cannot drift: a
// field added to `checkInDetailsSchema` without a line here is one the diver is never
// reminded of.
const CHECK_IN_DETAILS: {
  label: string;
  isFilled: (user: User) => boolean;
}[] = [
  { label: "date of birth", isFilled: (user) => !!user.date_of_birth },
  { label: "phone number", isFilled: (user) => !!user.phone },
  {
    label: "dive insurance",
    isFilled: (user) =>
      !!user.insurance_provider && !!user.insurance_policy_number,
  },
  {
    label: "emergency contact",
    isFilled: (user) =>
      !!user.emergency_contact_name && !!user.emergency_contact_phone,
  },
];

/**
 * The check-in details this diver has not filled in, in the order the summary prints
 * them.
 *
 * A suggestion rather than a requirement: a diver with no dive insurance is not
 * holding an incomplete record, and the surface that shows this says so. It stays off
 * the printed sheet entirely - a page handed to a stranger listing what its author
 * left blank is the opposite of what it is for.
 */
export function missingCheckInDetails(user: User): string[] {
  return CHECK_IN_DETAILS.filter(({ isFilled }) => !isFilled(user)).map(
    ({ label }) => label,
  );
}
