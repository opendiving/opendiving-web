import { apiClient } from "./client";

/**
 * What a `.divejson` document or `.zip` archive may be offered to the import as.
 *
 * Both spellings of each, because the picker matches on either and a browser that
 * knows neither extension sends `application/octet-stream` for the document. The
 * API re-checks the bytes regardless, and its check is the one that counts - this
 * only keeps the file dialog from showing a diver every file they own.
 */
export const LOGBOOK_IMPORT_ACCEPT =
  ".divejson,.zip,application/vnd.dive+json,application/zip";

/**
 * The client-side size ceilings, mirroring the API's own 413s.
 *
 * Two numbers because the API has two: a bare document is capped well below an
 * archive, which legitimately carries every dive-computer file and certification
 * scan in the account. Checked here so a diver on a slow connection is not made
 * to upload 400 MB before being told no.
 */
export const MAX_IMPORT_DOCUMENT_SIZE = 100 * 1024 * 1024; // 100 MB
export const MAX_IMPORT_ARCHIVE_SIZE = 500 * 1024 * 1024; // 500 MB

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
  | "value_dropped"
  | "reference_unresolved"
  | "species_unresolved"
  | "file_not_contained"
  | "file_skipped"
  | "diver_not_applied";

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
   * Non-zero means the list above is a prefix rather than the whole story, and
   * the UI has to say so - otherwise a 600-note import renders 500 notes as if
   * they were all of them. The collection counts stay complete either way; it is
   * only the note list that is truncated.
   */
  notes_truncated: number;
}

/** What produced the document, if it said. */
export interface ImportGenerator {
  name: string | null;
  version: string | null;
}

/** What `POST /import/divejson/preview` returns. Nothing has been written. */
export interface ImportPreview extends ImportReport {
  /** The document's own `format` marker, e.g. `divejson`. */
  format: string;
  /** The document's declared version, e.g. `1.0`. */
  version: string;
  generator: ImportGenerator | null;
  /** Whether this upload was a container carrying the stored files. */
  archive: boolean;
  /**
   * Hand this back to `apply` with the **same** file. It attests which bytes the
   * report describes and nothing else - the import re-plans the document from
   * scratch, so the token is not a stored plan to replay.
   */
  token: string;
}

/** What `POST /import/divejson` returns. Everything in it has been committed. */
export type ImportResult = ImportReport;

/**
 * Logbook import: reading a DiveJSON document back into the account that owns it.
 *
 * **One import is two calls**, and they share a rate limit - the API allows 20 an
 * hour per user across both. Preview writes nothing and hands back a `token`;
 * apply takes that token plus the same file and commits in a single transaction.
 * The two-step exists so a diver approves a plan rather than discovering what an
 * import did afterwards, which is also why both return the same `ImportReport`
 * shape: a plan and a result are only worth comparing if they are comparable.
 *
 * Neither endpoint takes a user parameter. The bearer token names the only account
 * there is to import into.
 *
 * **Every record-level problem is a note, never a status code.** A 4xx here means
 * the upload was not a document this app can read at all; anything about an
 * individual dive, site or file comes back inside a 200 as an `ImportNote`.
 */
export const logbookImportAPI = {
  /**
   * Plan the import and report what it would do. Writes nothing.
   *
   * The `Content-Type` header is explicitly cleared so the browser sets the
   * `multipart/form-data; boundary=...` it alone can compute - the shared client
   * defaults to `application/json`, which would make the API see no file at all.
   */
  async preview(file: File): Promise<ImportPreview> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.post<ImportPreview>(
      "/import/divejson/preview",
      formData,
      { headers: { "Content-Type": undefined } },
    );
    return response.data;
  },

  /**
   * Apply a previewed import, in one transaction.
   *
   * `token` must be the one from this same file's `preview` call: the API hashes
   * the body it receives and refuses a token minted for different bytes, which is
   * what stops a diver approving one document and uploading another.
   */
  async apply(file: File, token: string): Promise<ImportResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("token", token);

    const response = await apiClient.post<ImportResult>(
      "/import/divejson",
      formData,
      { headers: { "Content-Type": undefined } },
    );
    return response.data;
  },
};
