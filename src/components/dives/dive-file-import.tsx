"use client";

import { useRef, useState } from "react";
import { FieldPathValue, Path, UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  divesAPI,
  DiveFileInfo,
  DIVE_FILE_ACCEPT,
  MAX_DIVE_FILE_SIZE,
  ParsedDive,
} from "@/lib/api/dives";
import {
  formatDurationForForm,
  normalizeParsedStartTime,
} from "@/lib/date-time";
import { getApiErrorMessage } from "@/lib/api/error";
import { DiveFormValues } from "@/components/dives/dive-form-fields";
import { DiveMixtureInput } from "@/lib/validations/dive";
import {
  describeMixtureImport,
  existingMixtureFor,
  mergeMixture,
  mixtureImportNotes,
  type MixtureImportNotes,
} from "@/lib/dive-import";
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
): MixtureImportNotes {
  if (parsed.dive_number != null) {
    setDiveFormValue(form, "dive_number", parsed.dive_number);
  }
  const normalizedStartTime = parsed.start_time
    ? normalizeParsedStartTime(parsed.start_time)
    : undefined;
  if (normalizedStartTime) {
    setDiveFormValue(form, "start_time", normalizedStartTime);
  }
  if (parsed.duration != null) {
    setDiveFormValue(form, "duration", formatDurationForForm(parsed.duration));
  }
  if (parsed.max_depth != null) {
    setDiveFormValue(form, "max_depth", parsed.max_depth);
  }
  if (parsed.avg_depth != null) {
    setDiveFormValue(form, "avg_depth", parsed.avg_depth);
  }
  if (parsed.bottom_temperature != null) {
    setDiveFormValue(form, "bottom_temperature", parsed.bottom_temperature);
  }
  // No "guessed field" note for this one, unlike the mixtures below: the
  // computer's own salinity setting is either in the file or it isn't, and
  // nothing here invents a plausible value for an absent one.
  if (parsed.water_type != null) {
    setDiveFormValue(form, "water_type", parsed.water_type);
  }
  if (parsed.mixtures.length === 0) {
    return { guessed: {}, keptPressures: false, discardedPressures: false };
  }

  const existing = getDiveFormMixtures(form);
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
  // Called only after a *successful* parse, with the file and the token proving
  // the API parsed it. The page holds both and uploads them once the dive has
  // been saved - see `divesAPI.uploadDiveFile`. A failed parse applied nothing
  // to the form, so there is nothing to attach and this isn't called.
  onFileSelected?: (file: File, fileToken: string) => void;
  // The export already stored against this dive, on the edit form. Purely
  // informational: it tells the diver what importing again would replace.
  attachedFile?: DiveFileInfo | null;
}

export function DiveFileImport<TFieldValues extends DiveFormValues>({
  form,
  replaceMixtures,
  onFileSelected,
  attachedFile,
}: DiveFileImportProps<TFieldValues>) {
  const { toast } = useToast();
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  // What the import had to guess, shown next to the file name rather than in the
  // toast: the toast is gone in seconds, and this is exactly the thing the diver
  // has to still be able to see while fixing it.
  //
  // The rendered sentence, not the structured notes - it is a statement about the
  // file and never changes after import, so there is nothing to re-derive. See
  // `describeMixtureImport`.
  const [importNote, setImportNote] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Checked here as well as by the API so a diver on a slow connection
      // isn't made to upload an oversized file before being told no. The API
      // re-checks regardless, and its check is the one that counts.
      if (file.size > MAX_DIVE_FILE_SIZE) {
        toast({
          title: "File too large",
          description: "Dive files must be 5 MB or smaller.",
          variant: "destructive",
        });
        return;
      }

      setIsParsingFile(true);
      const parsed: ParsedDive = await divesAPI.parseDiveFile(file);
      const notes = applyParsedDiveToForm(form, parsed, replaceMixtures);
      onFileSelected?.(file, parsed.file_token);
      setPendingFileName(file.name);
      setImportNote(describeMixtureImport(notes));

      toast({
        title: "Dive file parsed",
        description:
          "Form fields have been filled in from the uploaded file. Please review before saving.",
      });
    } catch (error) {
      console.error("Failed to parse dive file:", error);

      const errorMessage = getApiErrorMessage(
        error,
        "Failed to parse the dive file. Please check the file and try again.",
      );

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsParsingFile(false);
      e.target.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-dashed p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-muted/40">
      <div>
        <p className="font-medium text-sm">Import from a dive computer file</p>
        <p className="text-sm text-muted-foreground">
          Upload a dive log export — a FIT file from a Garmin Descent or Suunto
          computer, or a Suunto XML or JSON export — to automatically fill in
          the fields below.
        </p>
        {pendingFileName ? (
          <p className="text-sm text-muted-foreground mt-1">
            Will be attached when you save:{" "}
            <span className="font-medium">{pendingFileName}</span>
          </p>
        ) : attachedFile ? (
          <p className="text-sm text-muted-foreground mt-1">
            Attached:{" "}
            <span className="font-medium">
              {attachedFile.original_filename}
            </span>{" "}
            &mdash; importing another file will replace it.
          </p>
        ) : null}
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
          className="hidden"
          onChange={handleFileSelected}
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
              Upload Dive File
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
