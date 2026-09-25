import type {
  Dive,
  DiveFileInfo,
  Recording,
  RecordingDecoModel,
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
 * What the API's `DiveMode` values are called in words.
 *
 * A lookup with no fallback entry on purpose. The vocabulary is closed in the
 * API's *current* build and the two repos deploy independently, so a mode this
 * bundle has never heard of is a real arrival — and the honest answer to it is
 * to say nothing rather than to print a raw `semi_closed_rebreather` or, worse,
 * to default to open circuit. **An absent mode is never open circuit**: UDDF
 * documents an absent `<divemode>` as meaning one, and neither repo reads that,
 * because it is the source format's claim about its own default rather than the
 * device's about the dive.
 */
const MODE_LABELS: Record<string, string> = {
  open_circuit: "Open circuit",
  closed_circuit: "Closed circuit",
  semi_closed: "Semi-closed",
  gauge: "Gauge",
  freedive: "Freedive",
};

/** The same, for the model families the API's `DecoAlgorithm` names. */
const ALGORITHM_LABELS: Record<string, string> = {
  buhlmann: "Bühlmann",
  rgbm: "RGBM",
};

/**
 * The same, for the API's `Salinity`: the density a device was set to, named as
 * the computer's own menu names it rather than as the dive's water types are.
 * `EN13319` is the European depth-gauge calibration, not a kind of water, and
 * keeps the standard's spelling because it has no other name.
 */
const SALINITY_LABELS: Record<string, string> = {
  fresh: "Fresh",
  en13319: "EN13319",
  salt: "Salt",
};

/**
 * The decompression model one device ran, in words, or `null` where nothing
 * worth a line was recorded.
 *
 * **The device's own name wins over the family**, which is the same call
 * `recordingDeviceLabel` makes between a model string and a brand: a Suunto
 * names its model `Suunto Fused RGBM 2` and that says more than `RGBM` does,
 * while `RGBM Suunto Fused RGBM 2` says one of them twice. The family is what
 * fills in where a source named a model without naming a product — a UDDF's
 * `<buehlmann>` element, a FIT's `zhl_16c`.
 *
 * The gradient factors attach to it (`Bühlmann GF 30/85`) because they are that
 * model's settings, and both halves are required together or not at all. The
 * conservatism is a separate clause: it is on the device's own scale and means
 * nothing without the model and the computer beside it, which is exactly where
 * this line is rendered.
 */
function decoModelLabel(model: RecordingDecoModel | null | undefined) {
  if (!model) return null;

  const named =
    model.name?.trim() ||
    (model.algorithm ? (ALGORITHM_LABELS[model.algorithm] ?? null) : null);
  const gradientFactors =
    model.gf_low != null && model.gf_high != null
      ? `GF ${model.gf_low}/${model.gf_high}`
      : null;
  const described = [named, gradientFactors]
    .filter((part): part is string => part != null)
    .join(" ");

  // `0` is a setting - the middle of Suunto's P-2 to P2 - so this tests for null
  // rather than for falsiness, and a positive value keeps its sign because the
  // scale runs both ways.
  const conservatism =
    model.conservatism == null
      ? null
      : `conservatism ${model.conservatism > 0 ? `+${model.conservatism}` : model.conservatism}`;

  return (
    [described || null, conservatism]
      .filter((part): part is string => part != null)
      .join(" · ") || null
  );
}

/**
 * What this device was set to when it recorded the dive: the mode it ran in, the
 * decompression model it ran and the salinity it divided pressure by, or `null`
 * where the source recorded none of them.
 *
 * One line rather than three because they are one fact about one machine — `Open
 * circuit · Bühlmann GF 30/85 · salinity EN13319`, or `Freedive` where a
 * freediving computer has no model to name, or a model alone where a file
 * recorded the algorithm and not the mode. The salinity is a clause like the
 * conservatism, named, because a bare `Salt` beside a mode says nothing.
 *
 * **Per recording, never per dive.** A backup computer run in gauge mode beside
 * a primary on open circuit is ordinary practice and the dive was not a gauge
 * dive; two computers give two answers, and the recording is the row that can
 * hold both.
 */
export function recordingSettingsLabel(recording: Recording): string | null {
  const mode = recording.mode ? (MODE_LABELS[recording.mode] ?? null) : null;
  const salinity = recording.salinity
    ? (SALINITY_LABELS[recording.salinity] ?? null)
    : null;

  return (
    [
      mode,
      decoModelLabel(recording.deco_model),
      salinity ? `salinity ${salinity}` : null,
    ]
      .filter((part): part is string => part != null)
      .join(" · ") || null
  );
}

/**
 * What this device reported about the dive as a whole, on one line, or `null`
 * where it reported none of it: `CNS 0% → 9% · OTU 0 → 22 · Surface pressure
 * 1.012 bar`.
 *
 * The recording's own readouts, which is the point of showing them per
 * recording at all: two computers on one dive give two answers to every one of
 * these, and the exposure card shows only the primary's. Displayed exactly as
 * stored and a missing half as an em dash, on `DiveExposureCard`'s terms, so the
 * two never read the same recording differently.
 */
export function recordingReadoutsLabel(recording: Recording): string | null {
  const pair = (
    label: string,
    start: number | null | undefined,
    end: number | null | undefined,
    unit = "",
  ) =>
    start == null && end == null
      ? null
      : `${label} ${start != null ? `${start}${unit}` : "—"} → ${end != null ? `${end}${unit}` : "—"}`;

  return (
    [
      pair("CNS", recording.cns_start, recording.cns_end, "%"),
      pair("OTU", recording.otu_start, recording.otu_end),
      recording.surface_pressure_bar != null
        ? `Surface pressure ${recording.surface_pressure_bar} bar`
        : null,
    ]
      .filter((part): part is string => part != null)
      .join(" · ") || null
  );
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
 * The recording whose readouts the exposure card shows and whose profile a
 * single-profile consumer takes — ordinal 0 — or `null` for a dive logged by
 * hand.
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
 * The confirmation before deleting a whole dive, shared by the list page and the
 * detail page — the case `DIVE_IS_UNTOUCHED` exists to rule out.
 *
 * **It names the files because they are the only part of this that is genuinely
 * gone.** The dive row is soft-deleted, but `delete_files_for_dive` hard-deletes
 * every recording of it, and the cascade takes their profiles and their files
 * with them and unlinks the stored blobs (`erase_dive` in the API's
 * `api/v1/dives.py`). So "This action cannot be undone", which is all this used
 * to say, was attached to the reversible half of the action while the
 * irreversible half went unmentioned.
 *
 * **It carries no counts, and that is what lets both pages say it.** The detail
 * page holds `dive.recordings` and could say how many recordings and files go;
 * `GET /dives` deliberately omits them, each costing a query, so the list page
 * could not. One prompt that is true of every dive beats a file-aware one on the
 * detail page and a vaguer one two clicks away on the list — the same
 * conclusion the certification delete reached, which names the card images
 * stored with it without counting them either.
 *
 * "Any" rather than "its" for the files, so the sentence stays true of a dive
 * logged by hand, which has neither a recording nor a file.
 */
export const DELETE_DIVE_CONFIRMATION =
  "Are you sure you want to delete this dive? Its recordings and any dive-computer files you imported are permanently deleted too — download anything you want to keep first.";

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

// Everything `refresh_tech_scalars` rewrites, as one noun phrase - the API's
// whole `DiveTechScalars` mixin, the entry and exit positions the dive page
// draws on its map. Named as one thing rather than enumerated because they move
// as one: the write is outright and covers the lot. A recording's own readouts
// are not among them; they go and come with that recording's files, which the
// file sentences say.
const COMPUTER_FIGURES = "the positions the dive computer recorded";

/**
 * What the positions the dive computer recorded do, as a sentence.
 *
 * **One rule sits under every branch**: the figures move only where the deletion
 * reached the recording shown by default, and then they become whatever that
 * slot holds files for once it is through. A deletion elsewhere on the dive is a
 * no-op - the API's `refresh_tech_scalars` takes a `touched_primary` and returns
 * without writing when it is false, precisely so that emptying a second
 * computer's recording cannot clear figures a converted logbook import wrote
 * onto the dive beside a file-less primary. Where the deletion *does* reach
 * ordinal 0, that rewrite is outright: every figure it does not find on the
 * primary's files is written null, so an empty ordinal 0 clears them however it
 * came to be empty - this recording survived its own last file, the recording
 * promoted in its place holds none, or there is nothing left to promote.
 * `renumber_ordinals` promotes in ordinal order without skipping a file-less
 * recording, so "is another recording there" is not the question; "does whoever
 * is primary afterwards hold a file" is.
 *
 * **No count of the branches here, deliberately.** One was stated and went wrong
 * twice in three commits, each time because the function grew a case; the rule
 * above is what a reader needs to check a branch against, and unlike a total it
 * cannot be made stale by adding one.
 */
function figuresSentence(
  recording: Recording,
  recordings: Recording[],
  outcome: RecordingOutcome,
): string {
  if (recording.ordinal !== 0) {
    return `Another recording is the one shown by default, so ${COMPUTER_FIGURES} are left alone.`;
  }
  if (outcome === "keeps files") {
    return `This recording also writes ${COMPUTER_FIGURES}, so those are re-read along with it.`;
  }
  if (outcome === "keeps samples only") {
    // The recording stays, but with no file behind it there is nothing to read
    // the figures off - which is what "nothing here can re-derive them" means.
    return `This recording's files wrote ${COMPUTER_FIGURES}, and they are cleared with the last of those files.`;
  }
  // Which recording takes over: the lowest ordinal among the rest. By ordinal
  // and not by position, because the edit form hands its list over unsorted.
  const successor = recordings.reduce<Recording | undefined>(
    (next, other) =>
      other.uuid === recording.uuid ||
      (next !== undefined && next.ordinal <= other.ordinal)
        ? next
        : other,
    undefined,
  );
  if (successor === undefined) {
    return `It is the dive's only recording, so ${COMPUTER_FIGURES} are cleared — nothing is left to read them from.`;
  }
  return successor.files.length > 0
    ? `It is the recording shown by default, so the next one takes over and ${COMPUTER_FIGURES} are re-read from that instead.`
    : `It is the recording shown by default, so the next one takes over — and it holds no file, so ${COMPUTER_FIGURES} are cleared.`;
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
 * them again. Each also moves the dive's recorded positions differently - see
 * `figuresSentence`.
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
      ? "The file is permanently deleted, and this recording's profile and readouts are re-read from the files it keeps."
      : outcome === "keeps samples only"
        ? `The file is permanently deleted, leaving this recording with nothing to download. Its samples and readouts stay — ${kept}, and no file can produce them again.`
        : "This is the recording's last file, so the whole recording goes with it: the file, its profile, its readouts and its samples, permanently.";

  return {
    title:
      outcome === "removed"
        ? "Delete this file and its recording?"
        : "Delete this file?",
    description: sentences(
      fileSentence,
      figuresSentence(recording, recordings, outcome),
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
        ? "The recording, its profile, its readouts, its samples and every file it holds are permanently deleted."
        : "The recording, its profile, its readouts and its samples are permanently deleted.",
      figuresSentence(recording, recordings, "removed"),
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
