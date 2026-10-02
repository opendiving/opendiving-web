import { DiveNumberingSummary } from "@/lib/api/dives";
import type { ImportDiveReport } from "@/lib/api/logbook-import";
import { combineStartTime, diveStartInstant } from "@/lib/date-time";

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

// A plain-English description of what a renumber would tidy in a log, for the
// card above the dive list and the offer on an import's result. Null when
// nothing is unused, shared or out of date order, which takes both - and with
// them every way in to Renumber - off a tidy log entirely.
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

// Whether a write left more dives sharing a number, or numbered out of date
// order, than the log had before it - what an import does when its dives take
// numbers the log already uses. Unused numbers are left out: the only ones an
// import adds are numbers its files state, which are the diver's own.
export function numberingTangledSince(
  before: DiveNumberingSummary,
  after: DiveNumberingSummary,
): boolean {
  return (
    after.duplicate_count > before.duplicate_count ||
    after.out_of_date_order_count > before.out_of_date_order_count
  );
}

// The renumber that offers to tidy after an import: from the day of the
// earliest dive it brought into the log, continuing from the dive before that
// day.
export interface ImportRenumberScope {
  // `RenumberDivesDialog`'s "Only dives from" day.
  fromDate: string;
  // The last second before that day begins, for `getNextDiveNumber`: its answer
  // is the number the renumber starts at.
  lastInstantBefore: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Null when the import brought no dive into the log - every dive it reached
// was already there, or skipped.
//
// The day is read at `offsetMinutes`, which has to be the offset the dialog
// turns its date back into an instant with (the browser's), so that the scope
// it starts always reaches the earliest dive: a day read in the dive's own zone
// can begin after the dive does in the browser's.
export function importRenumberScope(
  dives: readonly ImportDiveReport[],
  offsetMinutes: number,
): ImportRenumberScope | null {
  const instants = dives
    .filter((dive) => dive.outcome === "created" || dive.outcome === "restored")
    .map((dive) => dive.start_time)
    .filter((start): start is string => start !== null)
    .map(diveStartInstant)
    .filter((instant) => !Number.isNaN(instant));
  if (instants.length === 0) return null;

  const offsetMs = offsetMinutes * 60_000;
  const dayStart =
    Math.floor((Math.min(...instants) + offsetMs) / DAY_MS) * DAY_MS;
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return {
    fromDate: day(dayStart),
    lastInstantBefore: combineStartTime(
      `${day(dayStart - DAY_MS)} 23:59:59`,
      offsetMinutes,
    ),
  };
}
