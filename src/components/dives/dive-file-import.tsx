"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FieldPathValue, Path, UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  divesAPI,
  DIVE_FILE_ACCEPT,
  MAX_DIVE_FILE_SIZE,
  ParsedDive,
  ParsedDiveMatch,
  Recording,
} from "@/lib/api/dives";
import {
  formatDiveStartTime,
  formatDurationForForm,
  normalizeParsedStartTime,
} from "@/lib/date-time";
import { getApiErrorMessage } from "@/lib/api/error";
import { DiveFormValues } from "@/components/dives/dive-form-fields";
import {
  DiveRecordingFiles,
  type PendingDiveFile,
} from "@/components/dives/dive-recording-files";
import { DiveMixtureInput } from "@/lib/validations/dive";
import {
  describeMixtureImport,
  existingMixtureFor,
  fillMixture,
  mergeMixture,
  mixtureImportNotes,
  type MixtureImportNotes,
} from "@/lib/dive-import";
import { recordingDeviceLabel } from "@/lib/dive-recordings";
import { Loader2, Upload } from "lucide-react";

// Applies the fields parsed from a dive-computer export file onto a dive
// form. Shared between the "new dive" and "edit dive" forms since both
// expose the same importable field set. Generic over `TFieldValues` (rather
// than `UseFormReturn<any>`) so the concrete create/edit form type is
// checked at the call site; field name literals below are cast to
// `Path<TFieldValues>` since react-hook-form can't verify a literal string
// against a still-generic `TFieldValues`.
// Sets a single named field on the form. `name`/`value` are checked against
// `DiveFormValues` (a known, closed set of fields/types) rather than the
// still-generic `TFieldValues`, so callers get real type safety on both the
// field name and the value they pass in; only the final `form.setValue` call
// needs a narrow cast, since react-hook-form can't verify a `DiveFormValues`
// key/value pair against a still-unresolved `TFieldValues` type parameter.
function setDiveFormValue<
  TFieldValues extends DiveFormValues,
  TName extends keyof DiveFormValues & string,
>(
  form: UseFormReturn<TFieldValues>,
  name: TName,
  value: DiveFormValues[TName],
) {
  form.setValue(
    name as unknown as Path<TFieldValues>,
    value as unknown as FieldPathValue<TFieldValues, Path<TFieldValues>>,
    { shouldValidate: true, shouldDirty: true },
  );
}

// The mixtures currently on the form. Same cast reasoning as `setDiveFormValue`
// above: the field name is known against `DiveFormValues` but not against a
// still-generic `TFieldValues`.
function getDiveFormMixtures<TFieldValues extends DiveFormValues>(
  form: UseFormReturn<TFieldValues>,
): DiveMixtureInput[] {
  const mixtures = form.getValues(
    "mixtures" as unknown as Path<TFieldValues>,
  ) as unknown as DiveMixtureInput[] | undefined;
  return mixtures ?? [];
}

// Whether a form field is still empty, and so free for a fill-only import to
// write. `0` is a recorded reading and not an absence - a freedive to the
// surface logs `max_depth` 0 - so this is deliberately not falsiness.
function isDiveFormFieldEmpty<
  TFieldValues extends DiveFormValues,
  TName extends keyof DiveFormValues & string,
>(form: UseFormReturn<TFieldValues>, name: TName): boolean {
  const value = form.getValues(name as unknown as Path<TFieldValues>);
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  // A number input the diver cleared reads back as `NaN` rather than as
  // `undefined`, which is the one non-obvious empty state on this form.
  if (typeof value === "number") return Number.isNaN(value);
  return false;
}

/**
 * How a parsed file is written onto the form.
 *
 * `"prefill"` is the first file of a recording: it writes every field the file
 * carries, which is what makes importing a dive computer's export worth doing.
 *
 * `"fill-only"` is every later file — one the API reported as a second export of
 * a recording the dive already has, or one picked while another is already
 * pending or stored — and it writes only fields the form has left empty. That is
 * how "a second file of one recording fills, never overwrites" reaches
 * `avg_depth` and `duration`: those two are the form's own, and no attach or
 * import path on the server ever writes them, so if the rule did not hold here
 * it would not hold anywhere. A diver who has just corrected a depth does not
 * lose the correction to the same computer's second spelling of the same dive.
 */
export type ParsedDiveApplyMode = "prefill" | "fill-only";

export function applyParsedDiveToForm<TFieldValues extends DiveFormValues>(
  form: UseFormReturn<TFieldValues>,
  parsed: ParsedDive,
  // Replaces the `mixtures` field array wholesale. Must come from the *same*
  // `useFieldArray({ name: "mixtures" })` instance `MixtureFields` renders
  // with (passed down from the page - see `DiveFileImportProps.replaceMixtures`)
  // rather than a separate one created here: react-hook-form doesn't reliably
  // keep multiple separate `useFieldArray` instances on the same `control`/
  // `name` in sync (e.g. `replace()` on one instance doesn't shrink another
  // instance's `fields` when the new array is shorter - see DECISIONS.md),
  // and plain `form.setValue("mixtures", ...)` has the same problem.
  replaceMixtures: (mixtures: DiveMixtureInput[]) => void,
  mode: ParsedDiveApplyMode = "prefill",
): MixtureImportNotes {
  // One gate for all seven scalar fields below, so "fill-only" cannot be
  // honoured by six of them and forgotten by the seventh.
  const writes = <TName extends keyof DiveFormValues & string>(name: TName) =>
    mode === "prefill" || isDiveFormFieldEmpty(form, name);

  if (parsed.dive_number != null && writes("dive_number")) {
    setDiveFormValue(form, "dive_number", parsed.dive_number);
  }
  const normalizedStartTime = parsed.start_time
    ? normalizeParsedStartTime(parsed.start_time)
    : undefined;
  if (normalizedStartTime && writes("start_time")) {
    setDiveFormValue(form, "start_time", normalizedStartTime);
  }
  if (parsed.duration != null && writes("duration")) {
    setDiveFormValue(form, "duration", formatDurationForForm(parsed.duration));
  }
  if (parsed.max_depth != null && writes("max_depth")) {
    setDiveFormValue(form, "max_depth", parsed.max_depth);
  }
  if (parsed.avg_depth != null && writes("avg_depth")) {
    setDiveFormValue(form, "avg_depth", parsed.avg_depth);
  }
  if (parsed.bottom_temperature != null && writes("bottom_temperature")) {
    setDiveFormValue(form, "bottom_temperature", parsed.bottom_temperature);
  }
  // No "guessed field" note for this one, unlike the mixtures below: the
  // computer's own salinity setting is either in the file or it isn't, and
  // nothing here invents a plausible value for an absent one.
  if (parsed.water_type != null && writes("water_type")) {
    setDiveFormValue(form, "water_type", parsed.water_type);
  }
  if (parsed.mixtures.length === 0) {
    return { guessed: {}, keptPressures: false, discardedPressures: false };
  }

  const existing = getDiveFormMixtures(form);

  if (mode === "fill-only") {
    // A second file may fill a cylinder the form already has; it may not
    // reshape the list. Position is the only pairing signal there is, so a file
    // describing a different number of cylinders has nothing to say about which
    // of the form's rows its readings belong to - `existingMixtureFor`'s rule,
    // applied to the whole list rather than per row, because here the list on
    // screen is the one to preserve. A form with no cylinders at all takes the
    // file's, which fills rather than overwrites by definition.
    if (existing.length === 0) {
      replaceMixtures(
        parsed.mixtures.map((mixture) => mergeMixture(mixture).value),
      );
    } else if (existing.length === parsed.mixtures.length) {
      replaceMixtures(
        parsed.mixtures.map((mixture, index) =>
          fillMixture(mixture, existing[index]),
        ),
      );
    }
    return { guessed: {}, keptPressures: false, discardedPressures: false };
  }

  const merged = parsed.mixtures.map((mixture, index) =>
    mergeMixture(
      mixture,
      existingMixtureFor(existing, parsed.mixtures.length, index),
    ),
  );
  replaceMixtures(merged.map((cylinder) => cylinder.value));
  return mixtureImportNotes(parsed.mixtures, merged, existing);
}

export interface DiveFileImportProps<TFieldValues extends DiveFormValues> {
  form: UseFormReturn<TFieldValues>;
  // Must come from the same `useFieldArray` instance passed to `DiveFormFields`
  // as `mixtureFieldArray` (i.e. `replace` destructured from it) - see the
  // `applyParsedDiveToForm` doc comment above for why a separate instance
  // created here wouldn't work.
  replaceMixtures: (mixtures: DiveMixtureInput[]) => void;
  // Called only after a *successful* parse, with a file the page should hold
  // until the dive has been saved - see `divesAPI.attachRecordingFile`. A failed
  // parse applied nothing to the form, so there is nothing to attach and this
  // isn't called.
  //
  // More than one file can be waiting: a diver logging one dive off two
  // computers, or the same computer's JSON beside its FIT, picks each in turn
  // and every one of them is attached on save.
  onFileAdded?: (pending: PendingDiveFile) => void;
  // Raised the moment a parsed file has been written onto the form, before the
  // toast. The dive form uses it to put every field the file filled in back on
  // screen when the diver has it hidden - an imported cylinder volume the parser
  // guessed must not sit behind an unchecked box. `applyParsedDiveToForm` itself is
  // deliberately visibility-blind: it sets whatever the file carries, which is the
  // owner's import rule for free.
  onValuesApplied?: () => void;
  // The files this dive already holds, on the edit form. Empty on the create
  // form, where nothing is stored until the dive exists.
  recordings?: Recording[];
  // Files parsed on this form and not yet attached, held by the page.
  pending?: PendingDiveFile[];
  onRemovePending?: (id: string) => void;
  // Stored files struck off the list, and the two controls over that. Edit form
  // only, and deferred: the deletions go out with the save, beside the attaches,
  // so that Cancel leaves the dive's files exactly as it found them.
  removedStored?: string[];
  onRemoveStored?: (fileUuid: string) => void;
  onRestoreStored?: (fileUuid: string) => void;
  // The dive being edited, so a match against *this* dive can be told from a
  // match against another one. Absent on the create form, where every match is
  // another dive by definition.
  diveUuid?: string;
}

export function DiveFileImport<TFieldValues extends DiveFormValues>({
  form,
  replaceMixtures,
  onFileAdded,
  onValuesApplied,
  recordings = [],
  pending = [],
  onRemovePending,
  removedStored,
  onRemoveStored,
  onRestoreStored,
  diveUuid,
}: DiveFileImportProps<TFieldValues>) {
  const { toast } = useToast();
  const router = useRouter();
  const [isParsingFile, setIsParsingFile] = useState(false);
  // What the import had to guess, shown next to the file list rather than in the
  // toast: the toast is gone in seconds, and this is exactly the thing the diver
  // has to still be able to see while fixing it.
  //
  // The rendered sentence, not the structured notes - it is a statement about the
  // file and never changes after import, so there is nothing to re-derive. See
  // `describeMixtureImport`.
  const [importNote, setImportNote] = useState<string | null>(null);
  // A parsed file whose bytes look like they belong to a dive that already
  // exists, waiting for the diver to say which. **This path never attaches by
  // itself**, whatever the match says: a wrong match on a form is a dive the
  // diver did not ask for with nothing on screen to refuse it. Logbook import
  // is the opposite case and does attach automatically, because its preview is
  // already the confirmation step and its test is far stricter than this one.
  const [offer, setOffer] = useState<MatchOffer | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Whether a newly parsed file is allowed to overwrite what is on the form.
  //
  // The first file of a dive is the form's best information and writes
  // everything it carries. Every later one - a second computer, or this
  // computer's other export - fills blanks only, which is how first-file-wins
  // reaches `avg_depth` and `duration`: those two are the form's own and no
  // server-side attach or import path writes them, so if the rule does not hold
  // here it holds nowhere. `DECISIONS.md`, *"A second file of one recording
  // fills the form, and never overwrites it"*, has the whole argument.
  const hasFileAlready = pending.length > 0 || recordings.length > 0;

  // Applies a parsed file to the form and hands it to the page to attach on
  // save. Shared by the ordinary path and by "Log as a new dive", which is the
  // same thing after the diver has refused a match.
  //
  // `alreadyHasFile` is passed rather than read off `hasFileAlready`, because
  // within one pick this is called several times before React has re-rendered
  // with the files it added: the prop still says "none" while the second file
  // of the batch is being applied, and first-file-wins would collapse into
  // last-file-wins.
  const acceptParsedFile = (
    file: File,
    parsed: ParsedDive,
    alreadyHasFile: boolean,
  ) => {
    const sameRecording = (parsed.matches ?? []).some(
      (match) => match.same_recording && match.dive_uuid === diveUuid,
    );
    const notes = applyParsedDiveToForm(
      form,
      parsed,
      replaceMixtures,
      alreadyHasFile || sameRecording ? "fill-only" : "prefill",
    );
    onValuesApplied?.();
    onFileAdded?.({
      id: pendingFileId(),
      file,
      token: parsed.file_token,
      deviceLabel: recordingDeviceLabel(parsed.device),
    });
    // Kept rather than replaced. Only a prefill has anything to report, so
    // every file after the first answers `null` - and assigning that would wipe
    // the first file's note off the screen mid-batch. The pick clears it once,
    // in `handleFilesSelected`.
    const note = describeMixtureImport(notes);
    if (note) setImportNote(note);
  };

  // One toast for the pick rather than one per file: a diver emptying a
  // computer's card picks several at once, and a stack of identical toasts is
  // the same sentence four times over.
  const announceImported = (count: number) => {
    if (count === 0) return;
    toast({
      title: count === 1 ? "Dive file parsed" : `${count} dive files parsed`,
      description:
        count === 1
          ? "Form fields have been filled in from the uploaded file. Please review before saving."
          : "Form fields have been filled in from the uploaded files. Please review before saving.",
    });
  };

  // Parses the picked files one at a time and writes each onto the form, in
  // pick order.
  //
  // **Serially, and never in parallel.** The mode each file is applied in
  // depends on what the ones before it left behind, so a `Promise.all` here
  // would make first-file-wins depend on which response came back first.
  //
  // One bad file doesn't end the batch: an oversized or unparseable file says
  // so and the rest carry on, since the diver picked them together and has no
  // way to re-pick "the other three". A *match* does pause it - that is a
  // question only they can answer - and the remainder rides along on the offer
  // until they have.
  const importFiles = async (
    files: File[],
    seed: { hasFile: boolean; accepted: number },
  ) => {
    let hasFile = seed.hasFile;
    let accepted = seed.accepted;

    setIsParsingFile(true);
    try {
      for (const [index, file] of files.entries()) {
        // Checked here as well as by the API so a diver on a slow connection
        // isn't made to upload an oversized file before being told no. The API
        // re-checks regardless, and its check is the one that counts.
        if (file.size > MAX_DIVE_FILE_SIZE) {
          toast({
            title: "File too large",
            description: `${file.name} is larger than 5 MB, so it wasn't read.`,
            variant: "destructive",
          });
          continue;
        }

        let parsed: ParsedDive;
        try {
          parsed = await divesAPI.parseDiveFile(file);
        } catch (error) {
          console.error("Failed to parse dive file:", error);
          toast({
            title: "Error",
            description: getApiErrorMessage(
              error,
              `Failed to parse ${file.name}. Please check the file and try again.`,
            ),
            variant: "destructive",
          });
          continue;
        }

        // A match on a dive the diver is not looking at is the one case that
        // stops and asks. A match on *this* dive is not a question - the file
        // belongs here, which is what the form is already doing - it only
        // decides that the write fills rather than overwrites, above.
        const elsewhere = (parsed.matches ?? []).filter(
          (match) => match.dive_uuid !== diveUuid,
        );
        if (elsewhere.length > 0) {
          setOffer({
            file,
            parsed,
            match: elsewhere[0],
            rest: files.slice(index + 1),
            accepted,
          });
          return;
        }

        acceptParsedFile(file, parsed, hasFile);
        hasFile = true;
        accepted += 1;
      }

      announceImported(accepted);
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files ?? []);
    // Cleared before the first parse rather than after the last. The input is
    // what has to fire `change` again if the diver re-picks the same file, and
    // holding the old selection across an upload that takes seconds is how that
    // gets missed.
    e.target.value = "";
    if (files.length === 0) return;

    setImportNote(null);
    await importFiles(files, {
      hasFile: hasFileAlready,
      accepted: 0,
    });
  };

  // "Attach there": the file joins the dive it matched, right now, and the diver
  // goes to look at it. Nothing on this form is saved - the dive they were
  // filling in is the one this file turned out not to be.
  const attachToMatch = async () => {
    if (!offer) return;
    try {
      setIsAttaching(true);
      await divesAPI.attachRecordingFile(
        offer.match.dive_uuid,
        offer.file,
        offer.parsed.file_token,
      );
      toast({
        title: "File attached",
        description: `Added to dive #${offer.match.dive_number}.`,
      });
      setOffer(null);
      router.push(`/dives/${offer.match.dive_uuid}`);
    } catch (error) {
      console.error("Failed to attach the dive file:", error);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to attach the file to that dive. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsAttaching(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed p-4 bg-muted/40">
      {offer && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setOffer(null)}
          title="This file may already have a dive"
          description={describeMatch(offer.match)}
          confirmText="Attach there"
          variant="default"
          isLoading={isAttaching}
          secondaryAction={{
            label: "Log as a new dive",
            onClick: () => {
              const { file, parsed, rest, accepted } = offer;
              setOffer(null);
              acceptParsedFile(file, parsed, hasFileAlready);
              // Picks the batch back up where the question interrupted it, and
              // does the announcing even when nothing is left: `rest` empty is
              // the ordinary single-file case, and the toast belongs to the
              // pick rather than to the loop.
              void importFiles(rest, { hasFile: true, accepted: accepted + 1 });
            },
          }}
          onConfirm={attachToMatch}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">
            Import from a dive computer file
          </p>
          <p className="text-sm text-muted-foreground">
            Upload a dive log export — a FIT file from a Garmin Descent or
            Suunto computer, or a Suunto XML or JSON export — to fill in the
            fields below. Pick as many as you like at once: one per computer
            that recorded this dive, or one computer&apos;s second export
            alongside its first.
          </p>
          {/* Rendered unconditionally and `sr-only` until there is something to say: a
              `role="status"` region that mounts together with its text is typically not
              announced at all, since screen readers register it on insertion and read
              *subsequent* changes. The text is computed once at import and never changes
              afterwards, so this announces exactly once - see `describeMixtureImport`. */}
          <p
            role="status"
            className={
              importNote
                ? "text-sm text-amber-700 dark:text-amber-500 mt-1"
                : "sr-only"
            }
          >
            {importNote}
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={DIVE_FILE_ACCEPT}
            // A dive off two computers, or one computer's JSON beside its FIT,
            // was always two trips through this picker for no reason: the form
            // already holds a list and the server already decides per file
            // which recording it joins.
            multiple
            className="hidden"
            onChange={handleFilesSelected}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsingFile}
          >
            {isParsingFile ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Parsing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Dive Files
              </>
            )}
          </Button>
        </div>
      </div>

      <DiveRecordingFiles
        recordings={recordings}
        pending={pending}
        onRemovePending={(id) => onRemovePending?.(id)}
        removedStored={removedStored}
        onRemoveStored={onRemoveStored}
        onRestoreStored={onRestoreStored}
      />
    </div>
  );
}

// A parsed file the API matched against an existing dive, and the match it is
// being offered against. Only the nearest is offered: the list is ordered by
// start, and a second-best candidate is a question nobody can answer better
// than the first.
interface MatchOffer {
  file: File;
  parsed: ParsedDive;
  match: ParsedDiveMatch;
  /**
   * The files picked after this one, waiting on the answer. Held here rather
   * than in state of their own so that dismissing the dialog drops them with
   * the question - refusing to answer is not an instruction to carry on.
   */
  rest: File[];
  /** How many of this pick's files reached the form before the question. */
  accepted: number;
}

// What the match dialog says. Names the dive and the device, because those are
// the two things that make the offer checkable - "a dive nearby" is not
// something a diver can agree or disagree with.
function describeMatch(match: ParsedDiveMatch): string {
  const device = recordingDeviceLabel(match.device);
  const when = match.started_at
    ? formatDiveStartTime(match.started_at)
    : "an unrecorded time";

  return match.same_recording
    ? `Dive #${match.dive_number} already has a recording from ${device ?? "the same computer"}, starting ${when}. Attaching adds this file to that recording and fills in whatever it left blank — nothing already recorded is overwritten.`
    : `Dive #${match.dive_number} started around the same time (${when}${device ? `, recorded by ${device}` : ""}). Attaching adds this file to that dive as a second recording.`;
}

// `crypto.randomUUID` is available in every browser this app supports and in
// jsdom, but not over plain HTTP on a LAN address - a self-hoster's first
// look at the app from another machine. The counter is the fallback, and is
// only ever a key within one form's lifetime.
let pendingFileCounter = 0;
function pendingFileId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  pendingFileCounter += 1;
  return `pending-${pendingFileCounter}`;
}
