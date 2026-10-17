"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Save } from "lucide-react";

import { divesAPI, type Dive } from "@/lib/api/dives";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  buildDiveUpdate,
  diveToFormValues,
  diveUpdateSchema,
  type DiveUpdateInput,
} from "@/lib/validations/dive";
import { DiveFileImport } from "@/components/dives/dive-file-import";
import { diveTitleText } from "@/components/dives/dive-title";
import { useMixtureFieldArray } from "@/components/dives/mixture-fields";
import { usePendingDiveFiles } from "@/components/dives/use-pending-dive-files";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormApiError } from "@/components/ui/form-api-error";
import { useToast } from "@/components/ui/use-toast";

export interface DiveImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dive: Dive;
  /** Called once the dive has saved, so the page can re-read it. */
  onSaved: () => void;
}

/**
 * The dive form's Import section in a dialog, over the Recordings card: files
 * picked here and files struck off go out on Save, as on the Edit page, and
 * Cancel leaves the dive's files as it found them.
 */
export function DiveImportDialog({
  open,
  onOpenChange,
  dive,
  onSaved,
}: DiveImportDialogProps) {
  const panel = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={panel}
        className="sm:max-w-2xl"
        // The panel rather than the upload button - see `DiveSectionDialog`.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          panel.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit recordings</DialogTitle>
          <DialogDescription>
            {diveTitleText(dive.dive_number, dive.dive_sites)}
          </DialogDescription>
        </DialogHeader>
        <DiveImportForm
          dive={dive}
          onCancel={() => onOpenChange(false)}
          onSaved={() => {
            onSaved();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function DiveImportForm({
  dive,
  onCancel,
  onSaved,
}: {
  dive: Dive;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const recordings = dive.recordings ?? [];
  const files = usePendingDiveFiles(recordings);
  // The whole dive, which a picked file fills the blanks of. None of those fields
  // is on screen here, so only the ones a file wrote are validated and sent: a
  // stored value this dialog does not show can neither block the save nor ride
  // along with it.
  const form = useForm<DiveUpdateInput>({
    defaultValues: diveToFormValues(dive),
  });
  const mixtureFieldArray = useMixtureFieldArray(form.control);
  const [written, setWritten] = useState<ReadonlySet<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const save = async () => {
    setApiError(null);
    const keys = [...written].filter((key) => key in diveUpdateSchema.shape);
    let update = {};
    if (keys.length > 0) {
      const parsed = diveUpdateSchema
        .pick(
          Object.fromEntries(keys.map((key) => [key, true])) as Partial<
            Record<keyof typeof diveUpdateSchema.shape, true>
          >,
        )
        .safeParse(form.getValues());
      if (!parsed.success) {
        setApiError(
          parsed.error.issues[0]?.message ??
            "The file filled in a value the dive cannot hold.",
        );
        return;
      }
      update = buildDiveUpdate(parsed.data as DiveUpdateInput);
    }

    setIsSubmitting(true);
    try {
      if (Object.keys(update).length > 0) {
        await divesAPI.updateDive(dive.uuid, update);
      }
    } catch (error) {
      setApiError(
        getApiErrorMessage(error, "Failed to update dive. Please try again."),
      );
      setIsSubmitting(false);
      return;
    }

    await files.save(dive.uuid);

    setIsSubmitting(false);
    toast({ title: "Success", description: "Dive updated successfully!" });
    onSaved();
  };

  return (
    <div className="space-y-6">
      <DiveFileImport
        bare
        form={form}
        replaceMixtures={mixtureFieldArray.replace}
        {...files.fileList}
        recordings={recordings}
        diveUuid={dive.uuid}
        returnTo={`/dives/${dive.uuid}`}
        onWrite={(path) =>
          setWritten((paths) =>
            paths.has(path) ? paths : new Set(paths).add(path),
          )
        }
      />

      <FormApiError error={apiError} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={save}
          disabled={isSubmitting || !files.hasChanges}
        >
          {isSubmitting ? (
            <>
              <ButtonSpinner className="mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save changes
            </>
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}
