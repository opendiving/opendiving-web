import type {
  ImportCollectionReport,
  ImportNoteCode,
  ImportReport,
} from "@/lib/api/logbook-import";

// What each envelope collection is called on screen. The API sends the wire name
// ("gear_service_schedules") and the diver reads the app's own word for the thing
// ("Service schedules"), which is not derivable by title-casing: "sites" is "Dive
// sites" here and "gear_sets" is "Gear sets", not "Gear Sets".
//
// Keyed by the wire name in the envelope's own order, which is the order the API
// returns the collections in and the order they render in.
const COLLECTION_LABELS: Record<string, string> = {
  dives: "Dives",
  trips: "Trips",
  courses: "Courses",
  sites: "Dive sites",
  species: "Marine life",
  gear: "Gear",
  gear_sets: "Gear sets",
  gear_service_schedules: "Service schedules",
  gear_service_records: "Service records",
  certifications: "Certifications",
};

/**
 * A collection's display name, tolerating one this build has never heard of.
 *
 * A newer API that grew an eleventh collection should render as a readable row
 * rather than a blank cell, so an unknown wire name is de-snaked instead of
 * dropped - the same forward-compatibility stance `certificationAgencyLabel`
 * takes for a new agency. Counts are the point of the row and they are correct
 * whatever the heading says.
 */
export function collectionLabel(collection: string): string {
  return (
    COLLECTION_LABELS[collection] ??
    collection.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

/** The four disjoint counts, summed across every collection in a report. */
export interface ImportTotals {
  created: number;
  linked: number;
  restored: number;
  skipped: number;
}

/**
 * Adds a report's per-collection counts up.
 *
 * `restored` stays its own figure here exactly as it is on the wire: the API
 * guarantees the four are disjoint, and folding restores into "created" would
 * throw away the one number that says a backup actually came back.
 */
export function importTotals(report: ImportReport): ImportTotals {
  return report.collections.reduce<ImportTotals>(
    (totals, row) => ({
      created: totals.created + row.created,
      linked: totals.linked + row.linked,
      restored: totals.restored + row.restored,
      skipped: totals.skipped + row.skipped,
    }),
    { created: 0, linked: 0, restored: 0, skipped: 0 },
  );
}

/** Whether a collection row has anything in it at all. */
export function collectionRowIsEmpty(row: ImportCollectionReport): boolean {
  return (
    row.created === 0 &&
    row.linked === 0 &&
    row.restored === 0 &&
    row.skipped === 0
  );
}

/**
 * How a note should read: as something lost, or as something merely worth saying.
 *
 * The split is "did the diver end up with less than the document described".
 * A skipped record, a dropped value, an unresolved reference or species and a
 * file that could not be stored all lose something, so they are warnings. A
 * linked or restored record, either remap, a `diver` deliberately not applied and
 * a file whose bytes simply are not in a bare document are all the import working
 * as designed - `file_not_contained` especially, which is the *expected* state of
 * every referenced file when a document rather than an archive was imported, and
 * colouring it as a failure would make the ordinary case look broken.
 *
 * An unknown code from a newer API reads as information rather than as a warning:
 * inventing alarm for a note this build cannot interpret is the worse error.
 */
export function noteIsWarning(code: ImportNoteCode | string): boolean {
  return (
    code === "record_skipped" ||
    code === "value_dropped" ||
    code === "reference_unresolved" ||
    code === "species_unresolved" ||
    code === "file_skipped"
  );
}

/**
 * The sentence that says the note list is a prefix, or `null` when it is whole.
 *
 * The API caps the list and ships the overflow as a count precisely so a client
 * can say this. Without it a 600-note import renders 500 notes as though they
 * were all of them - and the *counts* above them stay complete either way, which
 * is the part the wording has to keep straight: nothing is missing from the
 * numbers, only from the list of remarks.
 */
export function truncatedNotesSentence(notesTruncated: number): string | null {
  if (notesTruncated <= 0) return null;
  return notesTruncated === 1
    ? "1 further note is not shown. The counts above are complete."
    : `${notesTruncated} further notes are not shown. The counts above are complete.`;
}

/**
 * What a bare document cannot do, said once, or `null` when it does not apply.
 *
 * A document references its stored files by digest and carries none of their
 * bytes, so every referenced file comes back `not_contained`. That is a smaller
 * restore rather than a failure, and the diver's move - re-import the archive -
 * is worth naming at the moment they can see the number.
 */
export function fileRestoreHint(
  report: ImportReport,
  archive: boolean,
): string | null {
  if (archive || report.files.not_contained === 0) return null;
  const n = report.files.not_contained;
  return `${n === 1 ? "This file is" : `These ${n} files are`} named by the document but not carried in it — import the full archive (.zip) to restore the bytes as well.`;
}
