import { apiClient } from "./client";
import type { RecordingDevice } from "./dives";

/**
 * A format the API's converter reads, as the converter itself names it.
 *
 * These are `divejson.read_formats()` ids at the release the API pins, not a
 * closed vocabulary: the pin moves by dependency bump with no change here, so a
 * `conversion.format` outside this union is an ordinary event rather than an
 * error. Everything that renders one goes through `importSourceLabel`, which
 * falls back to the id rather than taking the lockstep stance the hand-kept
 * enum mirrors take. The same ids label a file stored on a recording, since the
 * dive form reads through the same converter.
 */
export type ImportSourceFormat =
  "uddf" | "ssrf" | "fit" | "suunto_json" | "suunto_xml";

/**
 * Which file extensions offer each converted format in the dive form's picker.
 *
 * `Record<ImportSourceFormat, ...>`, so widening the union without offering an
 * extension stops this file compiling rather than silently greying a format out
 * of the dive form's file dialog (`DIVE_COMPUTER_FILE_ACCEPT`). The Import page
 * offers every file and filters nothing, so this list is the form's alone.
 *
 * Each entry mirrors that adapter's own `suffixes` in the converter, which is
 * why a UDDF file named `.xml` is not offered and `.json` - the Suunto app's
 * export, and broad - is. `.xml` is offered for Suunto's DM5 export and is
 * broad in the same way, which is now two of the five: an extension this list
 * claims is one several unrelated formats also use.
 *
 * That is survivable because acceptance itself is decided API-side by sniffing
 * the bytes; this list only decides what the dialog greys out. A `.xml` the
 * converter does not recognise is offered by the picker and refused on upload,
 * which is the right way round - the alternative is a diver whose real Suunto
 * export is greyed out with nothing on screen saying why.
 */
export const LOGBOOK_IMPORT_SOURCE_EXTENSIONS: Record<
  ImportSourceFormat,
  readonly string[]
> = {
  uddf: [".uddf"],
  ssrf: [".ssrf"],
  fit: [".fit"],
  suunto_json: [".json"],
  suunto_xml: [".xml"],
};

/** What to call each converted format on screen. */
const IMPORT_SOURCE_LABELS: Record<ImportSourceFormat, string> = {
  uddf: "UDDF",
  ssrf: "Subsurface",
  fit: "FIT",
  suunto_json: "Suunto app JSON",
  // "DM5" rather than a bare "Suunto XML": the app's JSON is also a Suunto XML
  // export in the loose sense, and the two are different readers offered side
  // by side in the same picker.
  suunto_xml: "Suunto DM5 XML",
};

/**
 * The ids an import reports beside the converter's own: what a file of the
 * import was read as when it was not converted (`divejson`, `archive`, `zip`),
 * and what `conversion.format` says when the converted files were not all one
 * format (`mixed`). Kept apart from `IMPORT_SOURCE_LABELS` because the dive
 * form's accept list is built from that map's key type, and none of these is a
 * file the form takes.
 */
const IMPORT_CONTAINER_LABELS: Record<
  "divejson" | "archive" | "zip" | "mixed",
  string
> = {
  divejson: "DiveJSON",
  archive: "OpenDiving archive",
  zip: "Zip",
  mixed: "Several formats",
};

/**
 * A source format's display name, tolerating one this build has never heard of.
 *
 * The fallback is the whole point rather than defensiveness: the API's format
 * list is derived from its pinned converter on every call, that pin moves by
 * dependency bump alone, and a `Record` lookup would render `undefined` in the
 * import report the day a new reader ships. Showing a bare `shearwater_db` is
 * worse than a label and far better than a blank.
 *
 * **It has already happened once, which is the argument for keeping it.** The
 * converter gained `suunto_xml` in a release the API absorbed by a version
 * bump, and for that bump's lifetime this function was the only thing standing
 * between a diver and an `undefined` in the import report's heading. The label
 * for it is now written out above; the fallback is what covers the next one.
 */
export function importSourceLabel(format: string): string {
  const labels: Record<string, string> = {
    ...IMPORT_SOURCE_LABELS,
    ...IMPORT_CONTAINER_LABELS,
  };
  return labels[format] ?? format;
}

/**
 * What the dive form's picker offers: every dive-computer format the API
 * converts, and nothing else - not DiveJSON or a zip, which the parse route
 * refuses.
 */
export const DIVE_COMPUTER_FILE_ACCEPT = Object.values(
  LOGBOOK_IMPORT_SOURCE_EXTENSIONS,
)
  .flat()
  .join(",");

/**
 * The client-side ceilings, mirroring the API's own 413s.
 *
 * Checked here so a diver on a slow connection is not made to upload 400 MB
 * before being told no; the API re-checks regardless. `MAX_IMPORT_ARCHIVE_SIZE`
 * bounds one zip and the whole request alike. `MAX_IMPORT_DOCUMENT_SIZE` bounds
 * any other file, which the API reports as a refused file rather than refusing
 * the request, and also what one import may plan in all - a bound the client
 * cannot check, since only the API can tell a full-export archive from a zip of
 * dive-computer files.
 */
export const MAX_IMPORT_DOCUMENT_SIZE = 100 * 1024 * 1024; // 100 MB
export const MAX_IMPORT_ARCHIVE_SIZE = 500 * 1024 * 1024; // 500 MB
/** How many files one import may carry; past it, the API asks for a zip. */
export const MAX_IMPORT_FILES = 1000;

/**
 * Why one record or value did not import exactly as the document described it.
 *
 * Mirrors the API's `ImportNoteCode`. A code beside the sentence so this app can
 * group, count and style notes without parsing prose - the `MixtureImportNotes`
 * discipline raised from one dive to a whole logbook.
 *
 * The two `record_remapped_*` values are one distinction the API deliberately
 * spent a second enum member on, and they are named for **what happened to other
 * records' references**, not for what caused it: `_follow` moved every reference
 * onto the new identity, `_stay` left them pointing at the first of two records
 * claiming one uuid. A client that needs to behave differently by cause can read
 * one value and know; before the split it had to parse the message.
 */
export type ImportNoteCode =
  | "record_skipped"
  | "record_linked"
  | "record_remapped_references_follow"
  | "record_remapped_references_stay"
  | "record_restored"
  // A document an earlier version of this app, or of the reference converter,
  // wrote before a change to the format - read as its writer meant it: an axis in
  // seconds, a readout on the dive, `en13319` as a dive's water. Nothing was lost,
  // so information rather than a warning.
  | "read_as_written"
  | "value_dropped"
  // A value the document does not state, worked out from what it does - a
  // dive's duration from its profile's span, its bottom temperature from its
  // coldest sample. Information: nothing was lost. At the API's note cap these
  // give way to every other note, so a truncated list keeps the others.
  | "value_derived"
  | "reference_unresolved"
  | "species_unresolved"
  | "file_not_contained"
  | "file_skipped"
  // The two recording outcomes, and **neither is a warning**: `noteIsWarning`
  // leaves both as plain information, which is what they are. A recording that
  // matched an existing dive was attached to it instead of creating a second
  // dive, and one that matched an existing *recording* filled that recording's
  // blanks. Both are the import doing exactly what it exists to do - the
  // alternative in each case is a duplicate - so colouring them as problems
  // would teach a diver to distrust a correct result.
  | "recording_attached"
  | "recording_filled"
  | "diver_not_applied"
  // An emergency contact or insurance the document carries but the preview does not
  // offer: it names nobody, or it is not the first. A warning.
  | "check_in_detail_dropped"
  // Only when a fact or the portrait actually changed, which is what tells the card
  // to re-read the signed-in user.
  | "check_in_detail_written"
  // The archive's portrait was taken, and the account's had changed since the
  // preview, so the account's stayed. Information: nothing was lost.
  | "portrait_kept"
  // A person was linked (apply), or would be (preview), to the account on this
  // instance its entry names; the sentence names that account's current
  // username. Information: the link is what the file asked for, under the same
  // per-user limit a typed username counts against.
  | "account_linked"
  // The tags the import adds to the diver's list (apply) or would (preview),
  // named in one note. Tags are members of a dive rather than a collection, so
  // no row of counts has them. Information: nothing is lost.
  | "tags_created";

/** One thing the import decided, addressed to the diver. */
export interface ImportNote {
  code: ImportNoteCode;
  /** Which envelope collection this is about, e.g. `dives`. */
  collection: string | null;
  /** The record's uuid **as the document spells it**, not as any row here does. */
  uuid: string | null;
  /** One sentence, ready to render. */
  message: string;
}

/**
 * What would happen (preview) or did happen (apply) to one envelope collection.
 *
 * The four counts are disjoint and sum to what the document carries. `restored`
 * is its own figure and never hides inside `created` or `skipped`: un-deleting is
 * the one thing import does that nothing else in the app can, and a diver
 * restoring a backup is entitled to see it counted.
 */
export interface ImportCollectionReport {
  collection: string;
  created: number;
  /** Matched an existing row of the caller's; nothing was written. */
  linked: number;
  /** A soft-deleted row of the caller's, brought back under its own uuid. */
  restored: number;
  skipped: number;
}

/**
 * The binaries, which follow different rules from the records that reference them.
 *
 * A bare document carries file *metadata* and no bytes, so `restored` is zero and
 * `not_contained` is every referenced file. **That is not an error** - it is a
 * smaller restore, and the UI says so rather than colouring it as a failure. Only
 * an archive can put bytes back.
 */
export interface ImportFileReport {
  /** Stored files the document names. */
  referenced: number;
  /** Files whose bytes were written to this instance. */
  restored: number;
  /** Files with no bytes in this document - import the archive instead. */
  not_contained: number;
  /** Files whose bytes are here but could not be stored. */
  skipped: number;
}

/** What converted the upload, so a report can be attributed to a version of it. */
export interface ConversionConverter {
  name: string;
  version: string;
}

/**
 * One thing the conversion could not carry, and everywhere it came up.
 *
 * `kind` is **an opaque string, not a union**, and the API guarantees it will
 * stay one. Its converter's kind set grew from three to four while this card was
 * being built, and the pin that decides which set a build sees moves by a
 * dependency bump with nothing here changing - so a kind this app has never seen
 * can arrive between one deploy and the next. `conversionKindTone` renders an
 * unfamiliar one as plain information, the `noteIsWarning` stance.
 */
export interface ConversionNoteGroup {
  /** `absent`, `inferred`, `resolved` or `dropped` at the time of writing. */
  kind: string;
  /** One sentence, ready to render. */
  message: string;
  /** How many places raised this, which may be more than `wheres` lists. */
  count: number;
  /**
   * Up to three paths into the source files, each under the name of the file it
   * is in, e.g. `dives.uddf/dive/0/tankdata/1`.
   */
  wheres: string[];
}

/**
 * What converting the import's non-DiveJSON files could not carry. `null` when
 * every file was DiveJSON already.
 *
 * Grouped by the API rather than here, and by `(kind, message)`: one source habit
 * makes one finding per record - eight dives with no UTC offset are eight
 * findings - and grouping in the browser would be a second implementation of a
 * rule that already has one.
 */
export interface ConversionReport {
  /**
   * The format the converted files were read as, **as the converter names
   * it**, or `mixed` when they were not all one format - so an id rather than
   * a label, and not necessarily an `ImportSourceFormat` this build knows.
   * Render it through `importSourceLabel`.
   */
  format: string;
  converter: ConversionConverter;
  /** Findings grouped by kind and message, in first-seen order. */
  groups: ConversionNoteGroup[];
  /**
   * Groups beyond the API's cap that are **not** in `groups`. Non-zero means the
   * list above is a prefix; the per-group counts stay complete either way.
   */
  groups_truncated: number;
}

/**
 * Why a file that was read is not kept as a file of the dive it becomes.
 *
 * Mirrors the API's `ImportMemberNotKept`; `importMemberNotKeptSentence` falls
 * back to plain words for a value this build does not know.
 */
export type ImportMemberNotKept =
  | "several_dives"
  | "several_recordings"
  | "too_large"
  | "already_stored"
  | "not_written";

/** One file of the import: a part of the request, or a file a zip among them held. */
export interface ImportMemberReport {
  /** The index of the request's `file` part this came from, from 0. */
  part: number;
  /** For a file a zip held, the index in `members` of that zip's own row. */
  container: number | null;
  /** The file's name, or its path inside the zip that held it. */
  name: string;
  byte_size: number;
  sha256: string;
  /**
   * What the file was read as: a converter format id, `divejson`, `archive` or
   * `zip`, or `null` for a file nothing here reads. Render through
   * `importSourceLabel`.
   */
  format: string | null;
  /** On a zip's own row, how many files it opened into. */
  opened: number | null;
  /** Whether the file is kept on the dive it becomes, as that dive's file. */
  kept: boolean;
  not_kept: ImportMemberNotKept | string | null;
  /** Why the file was refused, in one sentence; `null` for a file that was read. */
  refusal: string | null;
}

/** What the import does to one dive, as the most that happens to it. */
export type ImportDiveOutcome =
  "created" | "restored" | "linked" | "updated" | "skipped";

/** One dive the import creates or touches, and the files it came from. */
export interface ImportDiveReport {
  /**
   * The dive's identifier once written - the diver's own for a dive they
   * already have - or `null` for a dive the import skips. The result's rows are
   * the selection a later action over "the dives this import brought in" takes.
   */
  uuid: string | null;
  outcome: ImportDiveOutcome;
  /** On an `updated` dive, how many files it gains. */
  files_added: number;
  /** On an `updated` dive, how many computers' recordings it gains. */
  recordings_added: number;
  /** On a `skipped` dive, why, in one sentence. */
  reason: string | null;
  /**
   * As the dive read gives it: with the dive's own UTC offset, naive where it
   * records none, a bare `YYYY-MM-DD` where it states no time.
   */
  start_time: string | null;
  /** Seconds. */
  duration: number | null;
  /** Metres. */
  max_depth: number | null;
  /** Its first recording's device, whole, for `recordingDeviceLabel`. */
  device: RecordingDevice | null;
  /** The indexes in `members` of the files the dive came from. */
  members: number[];
}

/** The body of both responses: the same shape whether it is a plan or a result. */
export interface ImportReport {
  /** One entry per envelope collection, in the envelope's own order. */
  collections: ImportCollectionReport[];
  files: ImportFileReport;
  /** Every decision worth telling the diver about, in document order. */
  notes: ImportNote[];
  /**
   * Notes beyond the API's cap that are **not** in `notes`.
   *
   * Non-zero means the list above is not the whole story, and the UI has to say
   * so - otherwise a 600-note import renders 500 notes as if they were all of
   * them. The collection counts stay complete either way; it is only the note
   * list that is truncated.
   */
  notes_truncated: number;
  /**
   * What the conversion could not carry, or `null` when every file was
   * DiveJSON already.
   *
   * On the report rather than on the preview alone, so the panel that stays on
   * screen after an import still tells a diver what their computer's export lost
   * on the way in - the same reason preview and result are one shape at all.
   */
  conversion: ConversionReport | null;
  /**
   * One row per file, in the order the import reads them: each part of the
   * request and each file a zip among them held.
   */
  members: ImportMemberReport[];
  /**
   * One row per dive the import creates or touches. The review and the result
   * report dives through these alone: `collections` counts a document's records
   * by what the planner does to each, so a pair's second file and a file adding
   * to a stored dive count there as a skipped dive while their rows say "New"
   * and "Adds a file".
   */
  dives: ImportDiveReport[];
}

/** What produced the document, if it said. */
export interface ImportGenerator {
  name: string | null;
  version: string | null;
}

/** An emergency contact as the preview shows it and as the apply takes it back. */
export interface ImportCheckInEmergencyContact {
  name: string | null;
  phone: string | null;
  relationship: string | null;
}

/** A dive insurance, on the same terms. `expires_on` is a bare `YYYY-MM-DD`. */
export interface ImportCheckInInsurance {
  provider: string | null;
  number: string | null;
  expires_on: string | null;
}

/**
 * One check-in fact the document carries: what the account holds beside what the
 * API proposes. An object is proposed whole - the account's own when the document's
 * agrees with it on every member it carries, otherwise the document's alone.
 */
export type ImportCheckInDetail =
  | { detail: "born_on"; account: string | null; proposed: string }
  | { detail: "phone"; account: string | null; proposed: string }
  | {
      detail: "emergency_contact";
      account: ImportCheckInEmergencyContact | null;
      proposed: ImportCheckInEmergencyContact;
    }
  | {
      detail: "insurance";
      account: ImportCheckInInsurance | null;
      proposed: ImportCheckInInsurance;
    };

export type ImportCheckInDetailKey = ImportCheckInDetail["detail"];

/**
 * The facts the diver confirmed, sent beside the token. A key left out is not
 * written, `null` clears the fact, and an object replaces all of the account's.
 */
export interface ImportCheckInSubmission {
  born_on?: string | null;
  phone?: string | null;
  emergency_contact?: ImportCheckInEmergencyContact | null;
  insurance?: ImportCheckInInsurance | null;
}

/**
 * The archive's portrait beside the account's, for the diver to take or keep.
 *
 * A field next to `check_in_details` rather than an entry in it, as the API has it.
 */
export interface ImportPortraitOffer {
  /**
   * The account's portrait as its digest - the `?v=` of `GET /user/portrait` - or
   * `null` without one. Sent back as the choice's `account_sha256`.
   */
  account_sha256: string | null;
  /** The archive's portrait as a `data:image/webp` URL, framed as it would be stored. */
  proposed: string;
}

/**
 * What the diver chose for the offered portrait. `account_sha256` is the offer's,
 * `null` included, on *keep* as on *take*: the API requires the key, and a choice
 * without it is a 422 that fails the whole import.
 */
export interface ImportPortraitChoice {
  choice: "take" | "keep";
  account_sha256: string | null;
}

/** What `POST /import/logbook/preview` returns. Nothing has been written. */
export interface ImportPreview extends ImportReport {
  /**
   * The **first imported document's** own `format` marker, e.g. `divejson` -
   * which for a converted file is the converter's output rather than the file
   * the diver picked. What each file was is its `members` row.
   */
  format: string;
  /** That document's declared version, e.g. `1.0`. */
  version: string;
  /**
   * What produced that document, if it said. For a converted file this is the
   * converter (`divejson convert`), not whatever wrote the diver's file.
   */
  generator: ImportGenerator | null;
  /** Whether the import carries a full-export archive, which restores stored files. */
  archive: boolean;
  /**
   * Hand this back to `apply` with the **same** files under the same names. It
   * attests which bytes the report describes and nothing else - the import
   * re-plans from scratch, so the token is not a stored plan to replay.
   */
  token: string;
  /**
   * One entry per check-in fact the documents carry, in the order date of birth,
   * phone, emergency contact, insurance. Empty when they carry none.
   */
  check_in_details: ImportCheckInDetail[];
  /**
   * The archive's portrait, or `null` when the import carries none the API can
   * offer - `notes` say why - or carries the account's own at the same crop.
   */
  portrait: ImportPortraitOffer | null;
}

/** What `POST /import/logbook` returns. Everything in it has been committed. */
export type ImportResult = ImportReport;

/** Bytes of the request sent so far, against the whole request's. */
export type ImportUploadProgress = (sent: number, total: number) => void;

function importForm(files: readonly File[]): FormData {
  const formData = new FormData();
  for (const file of files) formData.append("file", file);
  return formData;
}

// The `Content-Type` header is explicitly cleared so the browser sets the
// `multipart/form-data; boundary=...` it alone can compute - the shared client
// defaults to `application/json`, which would make the API see no file at all.
async function postImport<T>(
  path: string,
  formData: FormData,
  onProgress?: ImportUploadProgress,
): Promise<T> {
  const response = await apiClient.post<T>(path, formData, {
    headers: { "Content-Type": undefined },
    onUploadProgress: onProgress
      ? ({ loaded, total }) => onProgress(loaded, total ?? loaded)
      : undefined,
  });
  return response.data;
}

/**
 * Logbook import: reading any number of files into the account that will hold
 * them.
 *
 * The API takes each file as a `file` part - a DiveJSON document, this app's
 * full-export archive, any dive-computer or logbook format its converter reads,
 * or a zip of any of those - and sorts them itself: nothing in the browser
 * parses a dive file or filters one by its name.
 *
 * **One import is two calls**, and they share a rate limit - the API allows 20 an
 * hour per user across both. Preview writes nothing and hands back a `token`;
 * apply takes that token plus the same files and commits in a single
 * transaction. The two-step exists so a diver approves a plan rather than
 * discovering what an import did afterwards, which is also why both return the
 * same `ImportReport` shape: a plan and a result are only worth comparing if
 * they are comparable.
 *
 * Neither endpoint takes a user parameter. The bearer token names the only account
 * there is to import into.
 *
 * **A file the API cannot read is a row, never a status code.** A 4xx is about
 * the request as a whole: it was too large or carried too many files, no file
 * in it could be read at all, or its files would take the account past its
 * storage limit. Anything about an individual file, dive, site or record comes
 * back inside a 200 - in `members`, `dives` or `notes`.
 */
export const logbookImportAPI = {
  /**
   * Plan the import and report what it would do. Writes nothing.
   *
   * `onProgress` hears the upload's bytes: every read sends every byte.
   */
  async preview(
    files: readonly File[],
    onProgress?: ImportUploadProgress,
  ): Promise<ImportPreview> {
    return postImport<ImportPreview>(
      "/import/logbook/preview",
      importForm(files),
      onProgress,
    );
  },

  /**
   * Apply a previewed import, in one transaction.
   *
   * `files` must be the ones this `token`'s preview was sent, under the same
   * names: the API hashes the parts again and refuses a token minted for a
   * different set, which is what stops a diver approving one plan and
   * uploading another.
   *
   * `checkIn` is the facts to write, as a JSON field; omitted, none is written.
   * `portrait` is the choice for the preview's `portrait`; omitted, the account
   * keeps its own.
   */
  async apply(
    files: readonly File[],
    token: string,
    checkIn?: ImportCheckInSubmission,
    portrait?: ImportPortraitChoice,
    onProgress?: ImportUploadProgress,
  ): Promise<ImportResult> {
    const formData = importForm(files);
    formData.append("token", token);
    if (checkIn) formData.append("check_in_details", JSON.stringify(checkIn));
    if (portrait) formData.append("portrait", JSON.stringify(portrait));
    return postImport<ImportResult>("/import/logbook", formData, onProgress);
  },
};
