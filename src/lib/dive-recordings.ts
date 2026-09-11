import type {
  Dive,
  DiveFileInfo,
  Recording,
  RecordingDevice,
} from "./api/dives";
import { diveParserLabel } from "./api/dives";

/**
 * What to call a recording whose source named no computer at all.
 *
 * A dive imported from a document that recorded samples and nothing about the
 * machine is an ordinary case, not a broken row, so it gets a word rather than a
 * blank cell — the `diveParserLabel` stance applied to a device.
 */
export const UNNAMED_DEVICE_LABEL = "Dive computer";

/**
 * One device on one line: brand and model, then the serial, then the name its
 * owner gave it.
 *
 * `null` when the device carries nothing worth putting on screen — a row with
 * only a firmware string has nothing to identify, and the caller substitutes
 * `UNNAMED_DEVICE_LABEL`.
 *
 * Two joins are doing real work here. **A model already carrying its brand does
 * not get it twice:** a FIT decodes its maker to the lowercase `suunto` beside
 * the model `Suunto Ocean`, and the API stores both exactly as the file wrote
 * them (it compares them case-folded and normalizes neither), so the naive join
 * renders `suunto Suunto Ocean`. And **a name equal to the model is dropped**,
 * because a Shearwater UDDF writes `Perdix 3` in both places and `Perdix 3
 * (Perdix 3)` says nothing twice.
 */
export function recordingDeviceLabel(
  device: RecordingDevice | null | undefined,
): string | null {
  if (!device) return null;

  const brand = device.brand?.trim() || null;
  const model = device.model?.trim() || null;
  const serial = device.serial?.trim() || null;
  const name = device.name?.trim() || null;

  const modelCarriesBrand =
    brand != null &&
    model != null &&
    model.toLowerCase().startsWith(brand.toLowerCase());
  const machine = [modelCarriesBrand ? null : brand, model]
    .filter((part): part is string => part != null)
    .join(" ");

  const parts: string[] = [];
  if (machine) parts.push(machine);
  if (serial) parts.push(serial);
  let label = parts.join(" · ");

  if (name && name.toLowerCase() !== model?.toLowerCase()) {
    label = label ? `${label} (${name})` : name;
  }

  return label || null;
}

/**
 * The dive's recordings in ordinal order, defaulted and never undefined.
 *
 * Sorted here rather than trusted: the API documents the order but every card
 * reading `recordings[0]` as "primary" would otherwise be one response shape
 * away from drawing the wrong device's figures. `Dive.recordings` is also
 * absent — not `[]` — on a list row and on any detail payload cached before
 * recordings existed, which is the other half of what this normalizes.
 */
export function diveRecordings(dive: Dive): Recording[] {
  return [...(dive.recordings ?? [])].sort((a, b) => a.ordinal - b.ordinal);
}

/**
 * The recording whose files wrote the dive's oxygen-exposure readings and whose
 * profile a single-profile consumer takes — ordinal 0 — or `null` for a dive
 * logged by hand.
 */
export function primaryRecording(dive: Dive): Recording | null {
  return diveRecordings(dive)[0] ?? null;
}

/**
 * A positional handle for a recording, for the one place the device is not
 * enough: two recordings of one dive that both name no computer.
 */
export function recordingLabel(recording: Recording): string {
  return `Recording ${recording.ordinal + 1}`;
}

/**
 * Why a recording holds no downloadable file, or `null` when it holds one.
 *
 * A recording with samples and no files is first-class rather than degenerate —
 * it is what logbook import builds from a converted document, and what a merge
 * of two such recordings leaves — so the list says so in words instead of
 * rendering an empty row that reads as a loss.
 *
 * **Which of the two it was comes from the profile's `provenance`**, the closed
 * `file` / `divejson_import` / `merge` vocabulary the dive read publishes on
 * every recording's profile summary. The recording's own shape cannot answer it:
 * `files` is empty either way, and a merge keeps whatever files either half had,
 * so file-lessness says only that neither half had one.
 *
 * The fallback covers the case with no provenance to read — a recording the
 * import wrote from a device and nothing else, which carries no profile at all,
 * and any payload that reaches a browser without the member. It claims nothing
 * about samples, because that recording has none.
 */
export function noFileKeptSentence(recording: Recording): string | null {
  if (recording.files.length > 0) return null;

  switch (recording.profile?.provenance) {
    case "divejson_import":
      return "No file kept — these samples were imported through the converter.";
    case "merge":
      return "No file kept — these samples were merged from two recordings.";
    default:
      return "No file kept — nothing was stored here to re-read this recording from.";
  }
}

/**
 * The title and the description of a confirmation before one destructive action
 * on a recording or one of its files.
 *
 * Both, because on this route the *title* is where the material difference
 * lands: deleting a file the recording survives and deleting the one that takes
 * the recording with it are different actions, and a dialog headed "Delete this
 * file?" for both asks about the smaller one.
 */
export interface RecordingConfirmation {
  title: string;
  description: string;
}

// The dive row itself is never touched by any of this - it is the recordings
// that are hard-deleted - and a diver being told their recording disappears is
// exactly who needs to hear it. Offered only where something did disappear; on a
// file among others it would be reassurance against a fear nobody has.
const DIVE_IS_UNTOUCHED =
  "The dive itself stays, with everything you typed on it.";

/**
 * Why this recording would survive losing its last file, as a clause, or `null`
 * when it would not survive it.
 *
 * The `provenance` question `noFileKeptSentence` asks, in the vocabulary that
 * one uses - this is describing the row that sentence is about to occupy. The
 * API keeps a recording whose samples no file could yield again, a merge's or a
 * converted document's, and deletes one whose profile was only ever read off the
 * file being removed (`delete_dive_file` in the API's `services/dive_files.py`).
 *
 * A recording carrying no profile at all falls to the `null` here and is
 * deleted, which is right: it has no samples to be unable to reproduce.
 */
function unreproducibleSamples(recording: Recording): string | null {
  switch (recording.profile?.provenance) {
    case "merge":
      return "they were merged from two recordings";
    case "divejson_import":
      return "they came in through the converter";
    default:
      return null;
  }
}

/** What is left of the recording once the action goes through. */
type RecordingOutcome = "keeps files" | "keeps samples only" | "removed";

/**
 * What the dive's own oxygen-exposure readings do, as a sentence.
 *
 * **Only the primary recording's files write them**, so for every other
 * recording the honest answer is that nothing moves - and that is worth a clause
 * rather than a silence, because nothing in the row a diver clicked says which
 * one they are looking at.
 *
 * Where the recording *is* primary there are three answers and the difference
 * between them is the whole point of this module: the readings are re-read from
 * what the recording keeps, re-read from whichever recording takes over as
 * primary, or cleared outright because nothing is left to read them from.
 */
function exposureSentence(
  recording: Recording,
  recordings: Recording[],
  outcome: RecordingOutcome,
): string {
  if (recording.ordinal !== 0) {
    return "Another recording is the one shown by default, so the dive's oxygen-exposure readings are left alone.";
  }
  if (outcome === "keeps files") {
    return "This recording also writes the dive's oxygen-exposure readings, so those are re-read along with it.";
  }
  if (outcome === "keeps samples only") {
    // The recording stays, but with no file behind it there is nothing to read
    // the readings off - which is what "nothing here can re-derive them" means.
    return "The dive's oxygen-exposure readings came off this recording's files, and are cleared with the last of them.";
  }
  return recordings.some((other) => other.uuid !== recording.uuid)
    ? "It is the recording shown by default, so the next one takes over and the dive's oxygen-exposure readings are re-read from that instead."
    : "It is the dive's only recording, so the dive's oxygen-exposure readings are cleared — nothing is left to read them from.";
}

function sentences(...parts: (string | null)[]): string {
  return parts.filter((part): part is string => part !== null).join(" ");
}

/**
 * What deleting one stored file will actually do, for the dialog that asks.
 *
 * Three outcomes behind one control, and the diver cannot tell them apart from
 * the row: the recording keeps its other files and re-reads its profile from
 * them; the recording's last file goes and **the recording goes with it**, its
 * profile and samples included; or the recording survives file-less because its
 * samples came from a merge or a converted document and no file could produce
 * them again. Each also moves the dive's own readings differently - see
 * `exposureSentence`.
 *
 * Takes the dive's whole recording list rather than the one recording, so that
 * "is this the last file", "is this the recording shown by default" and "is
 * there another one to take over" are all derived here instead of being answered
 * three times at two call sites. A `fileUuid` no recording holds gets a
 * conservative sentence rather than a confident wrong one; the dialog can
 * outlive a re-read that removed the row behind it.
 */
export function deleteFileConfirmation(
  recordings: Recording[],
  fileUuid: string,
): RecordingConfirmation {
  const recording = recordings.find((candidate) =>
    candidate.files.some((file) => file.uuid === fileUuid),
  );
  if (!recording) {
    return {
      title: "Delete this file?",
      description:
        "The file is permanently deleted, and what this dive shows may change with it.",
    };
  }

  const isLast = recording.files.length === 1;
  const kept = isLast ? unreproducibleSamples(recording) : null;
  const outcome: RecordingOutcome = !isLast
    ? "keeps files"
    : kept !== null
      ? "keeps samples only"
      : "removed";

  const fileSentence =
    outcome === "keeps files"
      ? "The file is permanently deleted, and this recording's profile is re-read from the files it keeps."
      : outcome === "keeps samples only"
        ? `The file is permanently deleted, leaving this recording with nothing to download. Its samples stay — ${kept}, and no file can produce them again.`
        : "This is the recording's last file, so the whole recording goes with it: the file, its profile and its samples, permanently.";

  return {
    title:
      outcome === "removed"
        ? "Delete this file and its recording?"
        : "Delete this file?",
    description: sentences(
      fileSentence,
      exposureSentence(recording, recordings, outcome),
      outcome === "removed" ? DIVE_IS_UNTOUCHED : null,
    ),
  };
}

/**
 * What deleting a whole recording will do, for the dialog that asks.
 *
 * Offered only for a recording holding no files - nothing else can remove one,
 * and where there are files deleting them one at a time is the smaller action -
 * but the sentence covers files anyway rather than assuming the caller's rule,
 * which is a claim about a button and not about this route.
 */
export function deleteRecordingConfirmation(
  recordings: Recording[],
  recordingUuid: string,
): RecordingConfirmation {
  const recording = recordings.find(
    (candidate) => candidate.uuid === recordingUuid,
  );
  if (!recording) {
    return {
      title: "Delete this recording?",
      description:
        "The recording and its samples are permanently deleted, and what this dive shows may change with it.",
    };
  }

  return {
    title: "Delete this recording?",
    description: sentences(
      recording.files.length > 0
        ? "The recording, its profile, its samples and every file it holds are permanently deleted."
        : "The recording, its profile and its samples are permanently deleted.",
      exposureSentence(recording, recordings, "removed"),
      DIVE_IS_UNTOUCHED,
    ),
  };
}

/** One line of the file list on a dive form or in the recordings card. */
export type DiveFileRow =
  | {
      kind: "file";
      /** Stable across re-renders and unique within the list. */
      key: string;
      recordingUuid: string;
      /** `null` where the recording's source named no computer. */
      deviceLabel: string | null;
      /** Only set when the dive has more than one recording. */
      recordingName: string | null;
      file: DiveFileInfo;
      /** The parser's own label, already resolved. */
      parserLabel: string | null;
    }
  | {
      kind: "empty";
      key: string;
      recordingUuid: string;
      deviceLabel: string | null;
      recordingName: string | null;
      /** Why there is no file — see `noFileKeptSentence`. */
      reason: string;
    };

/**
 * The stored half of a form's file list: a row per file, plus a row per
 * recording that kept none.
 *
 * A file-less recording earns a row rather than being skipped because the list
 * is a statement about what the account holds, and a device silently missing
 * from it is the thing a diver would read as data loss.
 *
 * `recordingName` is filled only on a dive with more than one recording, which
 * is decision-shaped rather than cosmetic: on a single-recording dive every row
 * belongs to the same device and a per-row "Recording 1" is noise.
 */
export function diveFileRows(recordings: Recording[]): DiveFileRow[] {
  const namesRecordings = recordings.length > 1;

  return recordings.flatMap((recording): DiveFileRow[] => {
    const deviceLabel = recordingDeviceLabel(recording.device);
    const recordingName = namesRecordings ? recordingLabel(recording) : null;

    if (recording.files.length === 0) {
      return [
        {
          kind: "empty" as const,
          key: `recording:${recording.uuid}`,
          recordingUuid: recording.uuid,
          deviceLabel,
          recordingName,
          reason: noFileKeptSentence(recording) ?? "",
        },
      ];
    }

    return recording.files.map((file) => ({
      kind: "file" as const,
      key: `file:${file.uuid}`,
      recordingUuid: recording.uuid,
      deviceLabel,
      recordingName,
      file,
      parserLabel: diveParserLabel(file.parser_key),
    }));
  });
}

/**
 * Whether the merge action has anything to offer for this dive.
 *
 * The API refuses a merge where either side is hand-entered — Subsurface's own
 * rule, and this app's route enforces it — so offering the action on a dive with
 * no recording would be offering a 422.
 */
export function canMergeDive(dive: Dive): boolean {
  return diveRecordings(dive).length > 0;
}
