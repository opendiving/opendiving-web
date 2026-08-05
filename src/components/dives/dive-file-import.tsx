"use client";

import { useRef, useState } from "react";
import { FieldPathValue, Path, UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { divesAPI, ParsedDive } from "@/lib/api/dives";
import { formatDateTimeForForm, formatDurationForForm } from "@/lib/date-time";
import { getApiErrorMessage } from "@/lib/api/error";
import { DiveFormValues } from "@/components/dives/dive-form-fields";
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

export function applyParsedDiveToForm<TFieldValues extends DiveFormValues>(
  form: UseFormReturn<TFieldValues>,
  parsed: ParsedDive,
) {
  if (parsed.dive_number != null) {
    setDiveFormValue(form, "dive_number", parsed.dive_number);
  }
  if (parsed.start_time) {
    const date = new Date(parsed.start_time);
    const formatted = Number.isNaN(date.getTime())
      ? parsed.start_time
      : formatDateTimeForForm(date);
    setDiveFormValue(form, "start_time", formatted);
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
    setDiveFormValue(
      form,
      "bottom_temperature",
      Math.round(parsed.bottom_temperature),
    );
  }
}

export interface DiveFileImportProps<TFieldValues extends DiveFormValues> {
  form: UseFormReturn<TFieldValues>;
}

export function DiveFileImport<TFieldValues extends DiveFormValues>({
  form,
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
      applyParsedDiveToForm(form, parsed);

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
          Upload a dive log export (e.g. Suunto XML) to automatically fill in
          the fields below.
        </p>
      </div>
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml"
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
