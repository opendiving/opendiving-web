"use client";

import { useRef, useState } from "react";
import { FieldPathValue, Path, UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { divesAPI, ParsedDive, ParsedDiveMixture } from "@/lib/api/dives";
import {
  combineStartTime,
  formatDateTimeForForm,
  formatDurationForForm,
  getBrowserUtcOffsetMinutes,
  parseUtcOffsetMinutes,
} from "@/lib/date-time";
import { getApiErrorMessage } from "@/lib/api/error";
import { DiveFormValues } from "@/components/dives/dive-form-fields";
import { DiveMixtureInput } from "@/lib/validations/dive";
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

// Normalizes a dive-computer file's raw `start_time` string into the single
// offset-aware `start_time` string the form (`DiveStartTimeField`) and the
// API both expect. Dive computers export this in two shapes:
// - With an explicit offset, e.g. "2021-04-04T10:04:47.910+02:00" - already
//   the shape we want, so it's used as-is.
// - Naive/local, e.g. "2025-06-03T12:15:33.8" (no offset at all) - its
//   literal date/time digits are kept (parsing a naive string with `Date`
//   and reading back local getters is a no-op transformation: no timezone
//   conversion happens since there's nothing to convert from) and combined
//   with the *browser's* current UTC offset, the best available default -
//   it's on the user to correct it if the dive computer's clock was
//   actually set to a different zone than wherever they are right now.
function normalizeParsedStartTime(rawStartTime: string): string | undefined {
  if (parseUtcOffsetMinutes(rawStartTime) !== null) {
    return rawStartTime;
  }

  const date = new Date(rawStartTime);
  if (Number.isNaN(date.getTime())) return undefined;
  return combineStartTime(
    formatDateTimeForForm(date),
    getBrowserUtcOffsetMinutes(),
  );
}

// Converts a parsed mixture (nullable fields, no `id`) into the shape the
// mixture form fields expect: `start_pressure`/`end_pressure` use "" (not
// `undefined`) as their "unset" placeholder, matching `DEFAULT_MIXTURE`'s
// convention in `mixture-fields.tsx`, and `name` is left `undefined` so the
// field shows blank rather than the literal string "null".
function toMixtureFormValue(mixture: ParsedDiveMixture): DiveMixtureInput {
  return {
    name: mixture.name ?? undefined,
    volume: mixture.volume,
    start_pressure: mixture.start_pressure ?? "",
    end_pressure: mixture.end_pressure ?? "",
    oxygen: mixture.oxygen,
    helium: mixture.helium,
  };
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
) {
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
  if (parsed.mixtures.length > 0) {
    replaceMixtures(parsed.mixtures.map(toMixtureFormValue));
  }
}

export interface DiveFileImportProps<TFieldValues extends DiveFormValues> {
  form: UseFormReturn<TFieldValues>;
  // Must come from the same `useFieldArray` instance passed to `DiveFormFields`
  // as `mixtureFieldArray` (i.e. `replace` destructured from it) - see the
  // `applyParsedDiveToForm` doc comment above for why a separate instance
  // created here wouldn't work.
  replaceMixtures: (mixtures: DiveMixtureInput[]) => void;
}

export function DiveFileImport<TFieldValues extends DiveFormValues>({
  form,
  replaceMixtures,
}: DiveFileImportProps<TFieldValues>) {
  const { toast } = useToast();
  const [isParsingFile, setIsParsingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsParsingFile(true);
      const parsed: ParsedDive = await divesAPI.parseDiveFile(file);
      applyParsedDiveToForm(form, parsed, replaceMixtures);

      toast({
        title: "Dive file parsed",
        description:
          "Form fields have been filled in from the uploaded file. Please review before saving.",
      });
    } catch (error: any) {
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
          Upload a dive log export (e.g. Suunto XML or JSON) to automatically
          fill in the fields below.
        </p>
      </div>
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.json"
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
