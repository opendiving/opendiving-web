import {
  MAX_IMPORT_ARCHIVE_SIZE,
  MAX_IMPORT_DOCUMENT_SIZE,
  MAX_IMPORT_FILES,
  type ImportCollectionReport,
  type ImportDiveOutcome,
  type ImportFileReport,
  type ImportNoteGroup,
  type LogbookImportDive,
  type LogbookImportRead,
  type LogbookImportSummary,
} from "@/lib/api/logbook-import";
import {
  formatDiveDateTime,
  formatUtcOffset,
  isDateOnlyStartTime,
  parseUtcOffsetMinutes,
} from "@/lib/date-time";
import { countNoun } from "@/lib/format";
import { labelOrFallback } from "@/lib/api/labels";

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
 * A collection's display name. A newer API can grow a collection this build has
 * no label for, which falls back as `labelOrFallback` says; counts are the point
 * of the row and they are correct whatever the heading says.
 */
export function collectionLabel(collection: string): string {
  return labelOrFallback(COLLECTION_LABELS, collection);
}

/** The three disjoint counts, summed across collection rows. */
export interface ImportTotals {
  created: number;
  linked: number;
  skipped: number;
}

/**
 * Adds the collection rows on screen up, so the total is the sum of what is
 * shown above it.
 */
export function importTotals(
  rows: readonly ImportCollectionReport[],
): ImportTotals {
  return rows.reduce<ImportTotals>(
    (totals, row) => ({
      created: totals.created + row.created,
      linked: totals.linked + row.linked,
      skipped: totals.skipped + row.skipped,
    }),
    { created: 0, linked: 0, skipped: 0 },
  );
}

/** Whether a collection row has anything in it at all. */
export function collectionRowIsEmpty(row: ImportCollectionReport): boolean {
  return row.created === 0 && row.linked === 0 && row.skipped === 0;
}

/**
 * The collection rows the counts table shows.
 *
 * Empty rows are left out, and so is the dives row wherever the import has dive
 * rows: `collections` counts a document's records by what the planner does to
 * each, so a computer's second export of a dive, or a file adding to a dive the
 * diver has, counts there as a skipped dive while its dive row says "new" or
 * "modified". The dive rows are the report on dives; the counts are the report
 * on everything else.
 */
export function reviewCollectionRows(
  record: Pick<LogbookImportRead, "collections" | "dives">,
): ImportCollectionReport[] {
  return record.collections.filter(
    (row) =>
      !collectionRowIsEmpty(row) &&
      !(row.collection === "dives" && record.dives.length > 0),
  );
}

/**
 * The sentence that says the note list is not all of them, or `null` when it is.
 *
 * The API caps the groups and ships the overflow as a count precisely so a
 * client can say this; without it a capped list reads as though it were all of
 * them.
 */
export function truncatedNotesSentence(notesTruncated: number): string | null {
  if (notesTruncated <= 0) return null;
  return `${countNoun(notesTruncated, "further note is", "further notes are")} not shown.`;
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
  files: ImportFileReport,
  archive: boolean,
): string | null {
  if (archive || files.not_contained === 0) return null;
  const n = files.not_contained;
  return `${n === 1 ? "This file is" : `These ${n} files are`} named by the document but not carried in it — import the full archive (.zip) to restore the bytes as well.`;
}

// What each note's kind is called on screen. Deliberately not a
// `Record<NoteKind, string>`: there is no such union to key on, because the API
// sends this field as an opaque string.
const NOTE_KIND_LABELS: Record<string, string> = {
  absent: "Not recorded",
  inferred: "Worked out",
  resolved: "Resolved",
  dropped: "Dropped",
};

/**
 * A note's badge text, or `null` for a note with no kind - an import decision
 * such as a linked record, which needs no badge to read right.
 *
 * The API sends `kind` as an **opaque string on purpose** and says so in the
 * field's own description: the file readers' set gained a fourth kind once, and
 * the pin that decides which set a build sees moves with no change here. So a
 * fifth falls back as `labelOrFallback` says rather than as a blank badge.
 */
export function noteKindLabel(kind: string | null): string | null {
  return kind === null ? null : labelOrFallback(NOTE_KIND_LABELS, kind);
}

/** How loudly a note should read. */
export type NoteKindTone = "warning" | "neutral" | "muted";

/**
 * Whether a note cost the diver something, merely explains, or is an absence.
 *
 * Only `dropped` is a loss: a file recorded something, or the document named a
 * record, and the diver ends up without it. `absent` is what a file never
 * recorded at all, which is a property of the file rather than of the import,
 * so it is quietest. `inferred`, `resolved` and a note with no kind - a linked
 * record, a recording attached to a dive it matched, a file whose
 * bytes a bare document simply does not carry - are the import working as
 * designed, and colouring them as problems would teach a diver to distrust a
 * correct result.
 *
 * **An unfamiliar kind reads as information, never as a warning**: a build that
 * predates a kind should render it plainly rather than invent alarm about a
 * sentence it cannot interpret. This branch is reachable without anyone
 * touching this repo - the API's reader pin moves on its own.
 */
export function noteKindTone(kind: string | null): NoteKindTone {
  if (kind === "dropped") return "warning";
  if (kind === "absent") return "muted";
  return "neutral";
}

/**
 * How often a group came up and where, or `null` for a note that came up once
 * and names no place.
 *
 * The API sends at most three `wheres` beside a complete `count`, so the count
 * is the honest figure and the paths are a pointer into the files rather than
 * the report. "and N more" is the difference between them, which is why it is
 * derived here rather than sent: a group whose count equals what it listed says
 * nothing extra. The import's own notes name no place, so theirs is a count of
 * times.
 */
export function noteGroupPlacesSentence(group: ImportNoteGroup): string | null {
  if (group.wheres.length === 0) {
    return group.count > 1 ? `${group.count} times` : null;
  }
  const places = countNoun(group.count, "place");
  const more = group.count - group.wheres.length;
  const listed =
    more > 0
      ? `${group.wheres.join(", ")} and ${more} more`
      : group.wheres.join(", ");
  return `${places} — ${listed}`;
}

/**
 * The sentence under a dive's notes that says the API cut the row's list, or
 * `null` when it did not. What the row leaves out is in the report's notes.
 */
export function truncatedDiveNotesSentence(truncated: number): string | null {
  if (truncated <= 0) return null;
  return `${countNoun(truncated, "further note about this dive is", "further notes about this dive are")} listed with the import's notes below.`;
}

const OUTCOME_LABELS: Record<ImportDiveOutcome, string> = {
  new: "New",
  modified: "Modified",
  unchanged: "Unchanged",
  skipped: "Skipped",
};

/** An outcome in the diver's words, tolerating one this build does not know. */
export function importOutcomeLabel(outcome: ImportDiveOutcome): string {
  return labelOrFallback(OUTCOME_LABELS, outcome);
}

/**
 * A dive's start as the file gives it: its wall clock, then the offset that clock
 * was on where it records one. A naive start stops after the clock, and a bare
 * date after the date - no midnight, and no zone nothing recorded.
 */
export function importStartText(startTime: string | null): string {
  if (!startTime) return "—";
  const when = formatDiveDateTime(startTime);
  if (isDateOnlyStartTime(startTime)) return when;
  const offset = parseUtcOffsetMinutes(startTime);
  return offset === null ? when : `${when} ${formatUtcOffset(offset)}`;
}

/** A row the review draws a card for: the rest are named on the log page. */
export function importRowHasCard(row: LogbookImportDive): boolean {
  return (
    (row.outcome === "new" || row.outcome === "modified") && row.dive !== null
  );
}

const OUTCOME_ORDER: readonly ImportDiveOutcome[] = [
  "new",
  "modified",
  "unchanged",
  "skipped",
];

function outcomeCounts(
  rows: readonly Pick<LogbookImportDive, "outcome">[],
): Record<ImportDiveOutcome, number> {
  const counts = { new: 0, modified: 0, unchanged: 0, skipped: 0 };
  for (const row of rows) counts[row.outcome] += 1;
  return counts;
}

export interface ImportSummaryTerm {
  outcome: ImportDiveOutcome;
  text: string;
}

/**
 * The summary line's terms, "12 new dives", "2 modified", "5 unchanged", "1
 * skipped", the zero ones left out. The first says what is being counted, and
 * the rest lean on it.
 */
export function importSummaryTerms(
  rows: readonly Pick<LogbookImportDive, "outcome">[],
): ImportSummaryTerm[] {
  const counts = outcomeCounts(rows);
  return OUTCOME_ORDER.filter((outcome) => counts[outcome] > 0).map(
    (outcome, index) => ({
      outcome,
      text:
        index === 0
          ? `${counts[outcome]} ${outcome} ${counts[outcome] === 1 ? "dive" : "dives"}`
          : `${counts[outcome]} ${outcome}`,
    }),
  );
}

/** A history row's counts in a sentence: "12 new, 2 modified". */
export function importCountsSentence(
  counts: LogbookImportSummary["counts"],
): string {
  const terms = OUTCOME_ORDER.filter((outcome) => counts[outcome]).map(
    (outcome) => `${counts[outcome]} ${outcome}`,
  );
  return terms.length > 0 ? terms.join(", ") : "No dives";
}

/**
 * The import button's label: the dives the review draws a card for, or "Import"
 * where there are none. **It never says an import would write nothing**: a
 * check-in detail or a tag is written without a dive row saying so, so the button
 * stays offered on every pending import.
 */
export function importButtonLabel(
  dives: readonly Pick<LogbookImportDive, "outcome">[],
): string {
  const written = dives.filter(
    (row) => row.outcome === "new" || row.outcome === "modified",
  ).length;
  return written > 0 ? `Import ${countNoun(written, "dive")}` : "Import";
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
