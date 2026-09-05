"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { dialogFormSubmit } from "@/lib/dialog-form";
import type { DiveFormPreset } from "@/lib/api/dive-form-presets";
import type { DiveFormPresets } from "@/hooks/useDiveFormPresets";

/**
 * The Presets tab: what the account has saved, and the two things that can be done to
 * one without changing the fields on the form.
 *
 * **Neither applying nor saving lives here.** The menu applies a preset in one click
 * from the card, and the Fields tab's "Save as" writes the current fields into a new
 * preset or over an existing one - so a row is left with renaming and deleting, which
 * is all that is genuinely about the preset rather than about the form.
 *
 * **Nor does the mark for which one is current.** The menu carries it, where it is the
 * answer to what the diver is about to pick from; renaming and deleting a preset are
 * the same acts whether or not its set happens to equal what is on the form, so a check
 * here only invited the reading that this row is somehow protected.
 */
export function DiveFormPresetList({ presets }: { presets: DiveFormPresets }) {
  const [renaming, setRenaming] = useState<DiveFormPreset | null>(null);
  const [promptName, setPromptName] = useState("");
  const [deleting, setDeleting] = useState<DiveFormPreset | null>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) promptInputRef.current?.focus();
  }, [renaming]);

  const closePrompt = () => {
    setRenaming(null);
    setPromptName("");
  };

  const handleRename = async () => {
    const name = promptName.trim();
    if (!name || !renaming) return;
    await presets.renamePreset(renaming, name);
    closePrompt();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await presets.deletePreset(deleting);
    setDeleting(null);
  };

  const rows = presets.presets;

  return (
    <div className="space-y-2">
      {presets.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading presets...</p>
      ) : rows && rows.length > 0 ? (
        <ul className="space-y-1">
          {rows.map((preset) => (
            <li key={preset.uuid} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm">{preset.name}</span>
              {presets.busyUuid === preset.uuid && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={presets.isWorking}
                onClick={() => {
                  setPromptName(preset.name);
                  setRenaming(preset);
                }}
              >
                Rename
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={presets.isWorking}
                onClick={() => setDeleting(preset)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No presets yet. Save the fields as one from the Fields tab, or restore
          the defaults.
        </p>
      )}

      <div className="pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={presets.isWorking}
          onClick={() => void presets.restoreDefaults()}
        >
          Restore default presets
        </Button>
      </div>

      {renaming && (
        // A `<form>` of its own so Enter confirms the name. `dialogFormSubmit`
        // stops the submit event there rather than letting React bubble it into
        // the dive form's own `onSubmit` - see "A dialog's submit event bubbles
        // into the form that opened it" in DECISIONS.md.
        <form
          className="flex flex-wrap items-end gap-2 pt-1"
          onSubmit={dialogFormSubmit((event) => {
            event?.preventDefault();
            void handleRename();
          })}
        >
          <div className="space-y-1">
            <label
              className="text-sm font-medium"
              htmlFor="dive-form-preset-name"
            >
              New name
            </label>
            <Input
              id="dive-form-preset-name"
              ref={promptInputRef}
              value={promptName}
              maxLength={255}
              onChange={(event) => setPromptName(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={presets.isWorking || promptName.trim().length === 0}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={presets.isWorking}
            onClick={closePrompt}
          >
            Cancel
          </Button>
        </form>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title="Delete this preset?"
        description={
          deleting
            ? `"${deleting.name}" will be removed. The fields on this form stay as they are.`
            : undefined
        }
        confirmText="Delete"
        isLoading={presets.isWorking}
        onConfirm={handleDelete}
      />
    </div>
  );
}
