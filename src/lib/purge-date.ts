// The one date an account deletion produces, and the two screens that show it.
//
// `DELETE /user` composes `purge_after` server-side and hands it back exactly once
// (see `delete-account-card.tsx`), and a `deletion_pending` outcome carries the same
// date to whoever signs in during the window. Both screens are read for that one
// fact, so both treat the value as untrusted: `/goodbye` takes it off the URL, and a
// row flagged with no clock to count from reaches the restore offer with no date at
// all. Rendering `new Date("whenever")` would put "Invalid Date" in front of the
// reader instead.

// The day, without a time of day. The grace window is measured in days, and an hour
// and minute on it would invite someone to plan around a deadline this app cannot
// promise to the minute - the purge is a scheduled job, not a timer.
const PURGE_DAY = {
  year: "numeric",
  month: "long",
  day: "numeric",
} as const;

// Parses a `purge_after` into a Date, or `null` for anything that isn't one. An
// absent, empty or unparseable value all read the same way: no date, so say nothing
// about a day.
export function parsePurgeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatPurgeDay(date: Date): string {
  return date.toLocaleDateString("en-US", PURGE_DAY);
}
