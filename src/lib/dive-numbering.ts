import { DiveNumberingSummary } from "@/lib/api/dives";

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

// A plain-English description of what a renumber would tidy in a log, for the
// card above the dive list. Null when a renumber would leave the log alone -
// that card is the only way in to Renumber, so it is absent exactly when
// Renumber has nothing to do.
//
// Deliberately descriptive rather than corrective: it never says "should", and
// nothing here is phrased as a problem. Gaps are the ordinary shape of a log
// that continues a paper logbook, duplicates are what back-filling looks like
// halfway through, and only the diver knows which of theirs are deliberate. A
// line that scolds is a line they stop reading - including on the day it would
// have told them something they didn't know.
export function describeDiveNumbering(
  summary: DiveNumberingSummary,
): string | null {
  if (
    summary.total_dives === 0 ||
    summary.lowest === null ||
    summary.highest === null
  ) {
    return null;
  }

  const notes: string[] = [];
  if (summary.missing_count > 0) {
    notes.push(
      `${summary.missing_count} ${plural(summary.missing_count, "number", "numbers")} unused`,
    );
  }
  if (summary.duplicate_count > 0) {
    notes.push(
      `${summary.duplicate_count} ${plural(summary.duplicate_count, "dive shares", "dives share")} a number`,
    );
  }
  if (summary.out_of_date_order_count > 0) {
    notes.push(`${summary.out_of_date_order_count} out of date order`);
  }

  if (notes.length === 0) {
    return null;
  }

  // `lowest === highest` survives the notes above only through duplicates -
  // several dives on one number - so it is a range that collapsed, not a log
  // of one dive, which has nothing for a renumber to change.
  const range =
    summary.lowest === summary.highest
      ? `#${summary.lowest}`
      : `#${summary.lowest}–#${summary.highest}`;

  return `Numbered ${range} — ${notes.join(", ")}.`;
}
