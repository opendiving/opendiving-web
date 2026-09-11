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
