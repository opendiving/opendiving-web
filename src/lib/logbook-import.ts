import {
  MAX_IMPORT_ARCHIVE_SIZE,
  MAX_IMPORT_DOCUMENT_SIZE,
  MAX_IMPORT_FILES,
  type ConversionNoteGroup,
  type ImportCollectionReport,
  type ImportDiveReport,
  type ImportMemberNotKept,
  type ImportNoteCode,
  type ImportReport,
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
  contacts: "Contacts",
  people: "People",
};

/**
 * A collection's display name, tolerating one this build has never heard of.
 *
 * A newer API that grew a collection this build has no label for should render
 * as a readable row rather than a blank cell, so an unknown wire name is
 * de-snaked instead of dropped - the same forward-compatibility stance `certificationAgencyLabel`
 * takes for a new agency. Counts are the point of the row and they are correct
 * whatever the heading says.
 */
export function collectionLabel(collection: string): string {
  return (
    COLLECTION_LABELS[collection] ??
    collection.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

/** The four disjoint counts, summed across collection rows. */
export interface ImportTotals {
  created: number;
  linked: number;
  restored: number;
  skipped: number;
}

/**
 * Adds the collection rows on screen up, so the total is the sum of what is
 * shown above it.
 *
 * `restored` stays its own figure here exactly as it is on the wire: the API
 * guarantees the four are disjoint, and folding restores into "created" would
 * throw away the one number that says a backup actually came back.
 */
export function importTotals(
  rows: readonly ImportCollectionReport[],
): ImportTotals {
  return rows.reduce<ImportTotals>(
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
 * The collection rows the counts table shows.
 *
 * Empty rows are left out, and so is the dives row wherever the report has dive
 * rows: `collections` counts a document's records by what the planner does to
 * each, so a computer's second export of a dive, or a file adding to a dive the
 * diver has, counts there as a skipped dive while its dive row says "New" or
 * "Adds a file". The dive rows are the report on dives; the counts are the
 * report on everything else.
 */
export function reviewCollectionRows(
  report: ImportReport,
): ImportCollectionReport[] {
  return report.collections.filter(
    (row) =>
      !collectionRowIsEmpty(row) &&
      !(row.collection === "dives" && report.dives.length > 0),
  );
}

/**
 * How a note should read: as something lost, or as something merely worth saying.
 *
 * The split is "did the diver end up with less than the document described".
 * A skipped record, a dropped value, an unresolved reference or species, a
 * file that could not be stored and a check-in detail the preview does not offer
 * all lose something, so they are warnings - a portrait the API refuses among
 * them, noted as a skipped file. A linked or restored record, either remap, a
 * value read as the older writer of its document meant it, the `diver`
 * member's identity and settings deliberately not applied, a check-in detail
 * or portrait written as confirmed, a portrait kept because the account's
 * changed after the preview, a person linked to the account on this instance
 * its entry names, the tags an import adds, and a file whose bytes simply are not in a bare
 * document are all the import working as designed - `file_not_contained`
 * especially, which is the *expected* state of every referenced file when a
 * document rather than an archive was imported, and colouring it as a failure
 * would make the ordinary case look broken.
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
    code === "file_skipped" ||
    code === "check_in_detail_dropped"
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

// What each conversion finding is called on screen, keyed by the converter's own
// kind. Deliberately not a `Record<ConversionKind, string>`: there is no such
// union to key on, because the API sends this field as an opaque string.
const CONVERSION_KIND_LABELS: Record<string, string> = {
  absent: "Not recorded",
  inferred: "Worked out",
  resolved: "Resolved",
  dropped: "Dropped",
};

/**
 * A finding's badge text, de-snaking a kind this build has never heard of.
 *
 * The API sends `kind` as an **opaque string on purpose** and says so in the
 * field's own description: its converter gained a fourth kind mid-feature, and
 * the pin that decides which set a build sees moves with no change here. So a
 * fifth arrives as itself rather than as a blank badge - `collectionLabel`'s
 * treatment of an unknown collection, for the same reason.
 */
export function conversionKindLabel(kind: string): string {
  return (
    CONVERSION_KIND_LABELS[kind] ??
    kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

/** How loudly a conversion finding should read. */
export type ConversionKindTone = "warning" | "neutral" | "muted";

/**
 * Whether a finding cost the diver something, merely explains, or is an absence.
 *
 * Only `dropped` is a loss: the source recorded something and it could not be
 * carried. `inferred` and `resolved` are the converter showing its working -
 * a value computed from recorded samples, or a unit it had to decide - and both
 * read plainly, with their badge carrying the distinction. `absent` is what the
 * source never recorded at all, which is a property of the file rather than of
 * the import, so it is quietest of the four.
 *
 * **An unfamiliar kind reads as information, never as a warning**, on the same
 * stance `noteIsWarning` takes for an unknown note code: a build that predates a
 * kind should render it plainly rather than invent alarm about a sentence it
 * cannot interpret. This branch is reachable without anyone touching this repo -
 * the API's converter pin moves on its own.
 */
export function conversionKindTone(kind: string): ConversionKindTone {
  if (kind === "dropped") return "warning";
  if (kind === "absent") return "muted";
  return "neutral";
}

/**
 * Where a finding came up, and how many places in all.
 *
 * The API sends at most three `wheres` beside a complete `count`, so the count
 * is the honest figure and the paths are a pointer into the source file rather
 * than the report. "and N more" is the difference between them, which is why it
 * is derived here rather than sent: a group whose count equals what it listed
 * says nothing extra.
 */
export function conversionWhereSentence(group: ConversionNoteGroup): string {
  const places = group.count === 1 ? "1 place" : `${group.count} places`;
  if (group.wheres.length === 0) return places;
  const more = group.count - group.wheres.length;
  const listed =
    more > 0
      ? `${group.wheres.join(", ")} and ${more} more`
      : group.wheres.join(", ");
  return `${places} — ${listed}`;
}

/**
 * The sentence saying the findings list is a prefix, or `null` when it is whole.
 *
 * `truncatedNotesSentence`'s shape, for the same reason and with one word
 * changed: the API caps the *groups*, not the counts inside them, so what is
 * missing is kinds of finding rather than occurrences.
 */
export function truncatedConversionSentence(
  groupsTruncated: number,
): string | null {
  if (groupsTruncated <= 0) return null;
  return groupsTruncated === 1
    ? "1 further finding is not shown. The record counts above are complete."
    : `${groupsTruncated} further findings are not shown. The record counts above are complete.`;
}

// Why a file that was read is not kept, in the diver's terms.
const NOT_KEPT_SENTENCES: Record<ImportMemberNotKept, string> = {
  several_dives: "Not kept: it holds several dives",
  several_recordings: "Not kept: it holds several computers' records",
  too_large: "Not kept: too large to keep as a dive's file",
  already_stored: "Not kept: your account already has this file",
  not_written: "Not kept: nothing is written for its dive",
};

/**
 * Why a file is not kept, tolerating a reason this build does not know - it
 * reads as the bare fact rather than as a blank.
 */
export function importMemberNotKeptSentence(reason: string): string {
  const sentences: Record<string, string> = NOT_KEPT_SENTENCES;
  return sentences[reason] ?? "Not kept";
}

function counted(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

/**
 * What an import does to one dive, in the diver's words rather than the code.
 *
 * An updated dive says what it gains; a skipped one says why.
 */
export function importDiveOutcomeSentence(row: ImportDiveReport): string {
  switch (row.outcome) {
    case "created":
      return "New";
    case "restored":
      return "Brought back from deletion";
    case "linked":
      return "Already in your logbook";
    case "updated": {
      const gains = [
        row.files_added > 0
          ? counted(row.files_added, "a file", "files")
          : null,
        row.recordings_added > 0
          ? counted(
              row.recordings_added,
              "another computer's recording",
              "other computers' recordings",
            )
          : null,
      ].filter((gain): gain is string => gain !== null);
      return gains.length > 0
        ? `Adds ${gains.join(" and ")} to a dive you have`
        : "Adds to a dive you have";
    }
    case "skipped":
      return row.reason ? `Skipped: ${row.reason}` : "Skipped";
    default:
      return String(row.outcome);
  }
}

/**
 * The import button's label, read from the dive rows alone.
 *
 * The dives created or restored where there are any; otherwise what the
 * updated rows add; otherwise just "Import". **It never says an import would
 * write nothing**: whether an apply changes a stored row is the writer's fact
 * and the report does not carry it - a fill of a recording's blanks, a
 * document's tags, a restored trip all write without a dive row saying so - so
 * the button stays offered and the rows and notes say what happens.
 */
export function importButtonLabel(dives: readonly ImportDiveReport[]): string {
  const brought = dives.filter(
    (row) => row.outcome === "created" || row.outcome === "restored",
  ).length;
  if (brought > 0) return `Import ${counted(brought, "1 dive", "dives")}`;

  const updated = dives.filter((row) => row.outcome === "updated");
  const files = updated.reduce((sum, row) => sum + row.files_added, 0);
  const recordings = updated.reduce(
    (sum, row) => sum + row.recordings_added,
    0,
  );
  const gains = [
    files > 0 ? counted(files, "1 file", "files") : null,
    recordings > 0 ? counted(recordings, "1 recording", "recordings") : null,
  ].filter((gain): gain is string => gain !== null);
  return gains.length > 0 ? `Import ${gains.join(" and ")}` : "Import";
}

/**
 * Whether a picked path is packaging rather than a file: a dot-file, anything
 * under a dot-folder, or anything under a `__MACOSX/` shadow tree. Dropped
 * silently, as the API drops them from a zip.
 */
export function isHiddenImportPath(path: string): boolean {
  return path
    .split("/")
    .some((segment) => segment.startsWith(".") || segment === "__MACOSX");
}

/**
 * Whether a file is a zip, by its name or type - used only to choose the size
 * bound the API will hold it to. The API decides by the bytes.
 */
export function isZipFile(file: Pick<File, "name" | "type">): boolean {
  return /\.zip$/i.test(file.name) || file.type === "application/zip";
}

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Why one picked file certainly cannot be read, or `null`. A file this refuses
 * is shown refused in its own row and left out of the request, as the API would
 * make it a refused row; the rest still reads.
 */
export function importFileRefusal(
  file: Pick<File, "name" | "type" | "size">,
): string | null {
  if (isZipFile(file)) {
    return file.size > MAX_IMPORT_ARCHIVE_SIZE
      ? `A zip may be up to ${megabytes(MAX_IMPORT_ARCHIVE_SIZE)}.`
      : null;
  }
  return file.size > MAX_IMPORT_DOCUMENT_SIZE
    ? `A file that is not a zip may be up to ${megabytes(MAX_IMPORT_DOCUMENT_SIZE)}. Import the full-export archive if you are restoring a whole account with its files.`
    : null;
}

/**
 * Why the files to be sent cannot go as one import, or `null` - the two bounds
 * of the whole request the API certainly holds it to.
 */
export function importSelectionRefusal(
  files: readonly Pick<File, "size">[],
): string | null {
  if (files.length > MAX_IMPORT_FILES) {
    return `One import may carry up to ${MAX_IMPORT_FILES} files. Zip them and import the zip instead.`;
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  return total > MAX_IMPORT_ARCHIVE_SIZE
    ? `One import may carry up to ${megabytes(MAX_IMPORT_ARCHIVE_SIZE)}. Import these files in parts.`
    : null;
}
