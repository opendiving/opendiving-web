"use client";

import { useRef, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { divesAPI, ParsedDive } from "@/lib/api/dives";
import { formatDateTimeForForm, formatDurationForForm } from "@/lib/date-time";
import { getApiErrorMessage } from "@/lib/api/error";
import { Loader2, Upload } from "lucide-react";

// Applies the fields parsed from a dive-computer export file onto a dive
// form. Shared between the "new dive" and "edit dive" forms since both
// expose the same importable field set.
export function applyParsedDiveToForm(form: UseFormReturn<any>, parsed: ParsedDive) {
  if (parsed.dive_number != null) {
    form.setValue("dive_number", parsed.dive_number, { shouldValidate: true, shouldDirty: true });
  }
  if (parsed.start_time) {
    const date = new Date(parsed.start_time);
    const formatted = Number.isNaN(date.getTime())
      ? parsed.start_time
      : formatDateTimeForForm(date);
    form.setValue("start_time", formatted, { shouldValidate: true, shouldDirty: true });
  }
  if (parsed.duration != null) {
    form.setValue("duration", formatDurationForForm(parsed.duration), { shouldValidate: true, shouldDirty: true });
  }
  if (parsed.max_depth != null) {
    form.setValue("max_depth", parsed.max_depth, { shouldValidate: true, shouldDirty: true });
  }
  if (parsed.avg_depth != null) {
    form.setValue("avg_depth", parsed.avg_depth, { shouldValidate: true, shouldDirty: true });
  }
  if (parsed.bottom_temperature != null) {
    form.setValue("bottom_temperature", Math.round(parsed.bottom_temperature), {
      shouldValidate: true,
      shouldDirty: true,
    });
  }
}

export interface DiveFileImportProps {
  // Using `any` here since this component is shared between the create and
  // edit dive forms, which have distinct (but structurally compatible) form types.
  form: UseFormReturn<any>;
}

export function DiveFileImport({ form }: DiveFileImportProps) {
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
        description: "Form fields have been filled in from the uploaded file. Please review before saving.",
      });
    } catch (error: any) {
      console.error('Failed to parse dive file:', error);

      const errorMessage = getApiErrorMessage(
        error,
        "Failed to parse the dive file. Please check the file and try again."
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
          Upload a dive log export (e.g. Suunto XML) to automatically fill in the fields below.
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
