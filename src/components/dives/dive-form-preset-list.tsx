"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Edit, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
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
 *
 * **Renaming happens in the row.** The pencil turns the name into a field and itself
 * into a tick, so the new name is typed where the old one was rather than in a prompt
 * below a list the diver then has to find their row in again. Delete becomes Cancel for
 * as long as that lasts: a delete button beside a half-typed rename is one mis-click
 * from destroying the row being edited, and without it there is no pointer way out of
 * the edit at all.
 *
 * The buttons are icons in an `IconTooltip` naming the preset, which is the shape
 * `GearItemsCard` already uses for its per-row actions.
 */
export function DiveFormPresetList({ presets }: { presets: DiveFormPresets }) {
  const [editing, setEditing] = useState<DiveFormPreset | null>(null);
  const [draftName, setDraftName] = useState("");
  const [deleting, setDeleting] = useState<DiveFormPreset | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  const stopEditing = () => {
    setEditing(null);
    setDraftName("");
  };

  const handleRename = async () => {
    const name = draftName.trim();
    if (!name || !editing) return;
    // An unchanged name is not a rename. Saving it anyway spends a PATCH to store
    // what is already stored, and reads as an edit in the account's history.
    if (name !== editing.name) await presets.renamePreset(editing, name);
    stopEditing();
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
          {rows.map((preset) => {
            const isEditing = editing?.uuid === preset.uuid;
            return (
              <li
                key={preset.uuid}
                className="flex flex-wrap items-center gap-2"
              >
                {isEditing ? (
                  // A `<form>` so Enter saves. `dialogFormSubmit` stops the submit
                  // event here rather than letting React bubble it into the dive
                  // form's own `onSubmit` - see "A dialog's submit event bubbles into
                  // the form that opened it" in DECISIONS.md.
                  <form
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onSubmit={dialogFormSubmit((event) => {
                      event?.preventDefault();
                      void handleRename();
                    })}
                  >
                    <Input
                      ref={nameInputRef}
                      value={draftName}
                      maxLength={255}
                      aria-label={`New name for "${preset.name}"`}
                      disabled={presets.isWorking}
                      onChange={(event) => setDraftName(event.target.value)}
                      // No Escape handling, deliberately. Radix's dialog listens
                      // for it on `document` in the *capture* phase, so it has
                      // already decided to close before a handler here runs and
                      // `stopPropagation` is too late to matter - verified by the
                      // test that tried it. Escape keeps its dialog meaning; the
                      // cross beside this field is the way out of the rename.
                      className="h-8 min-w-0 flex-1"
                    />
                    <IconTooltip
                      label={`Save the new name for "${preset.name}"`}
                    >
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        disabled={
                          presets.isWorking || draftName.trim().length === 0
                        }
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </IconTooltip>
                    <IconTooltip label={`Stop renaming "${preset.name}"`}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={presets.isWorking}
                        onClick={stopEditing}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </IconTooltip>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 text-sm">
                      {preset.name}
                    </span>
                    {presets.busyUuid === preset.uuid && (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden
                      />
                    )}
                    <IconTooltip label={`Rename "${preset.name}"`}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={presets.isWorking}
                        onClick={() => {
                          setDraftName(preset.name);
                          setEditing(preset);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </IconTooltip>
                    <IconTooltip label={`Delete "${preset.name}"`}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={presets.isWorking}
                        onClick={() => setDeleting(preset)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </IconTooltip>
                  </>
                )}
              </li>
            );
          })}
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
