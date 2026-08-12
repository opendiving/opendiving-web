import { DiveNumberingSummary } from "@/lib/api/dives";

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

// A plain-English description of a log's numbering, for the line above the dive
// list. Null when there's nothing to describe yet.
//
// Deliberately descriptive rather than corrective: it never says "should", and
// nothing here is phrased as a problem. Gaps are the ordinary shape of a log
// that continues a paper logbook, duplicates are what back-filling looks like
// halfway through, and only the diver knows which of theirs are deliberate. A
// line that scolds on every page load is a line they stop reading - including
// on the day it would have told them something they didn't know.
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

  const range =
    summary.lowest === summary.highest
      ? `#${summary.lowest}`
      : `#${summary.lowest}–#${summary.highest}`;

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
    return `Numbered ${range}, in order.`;
  }

  return `Numbered ${range} — ${notes.join(", ")}.`;
}
