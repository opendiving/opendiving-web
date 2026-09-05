"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormApiError } from "@/components/ui/form-api-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { dialogFormSubmit } from "@/lib/dialog-form";
import {
  DIVE_FORM_ALWAYS_ON_FIELDS,
  DIVE_FORM_FIELD_GROUPS,
  DIVE_FORM_FIELD_REGISTRY,
  hiddenFieldsEqual,
  isMixtureField,
  type DiveFormFieldEntry,
  type DiveFormFieldGroup,
  type DiveFormFieldKey,
} from "@/lib/dive-form-fields";
import type { DiveFormPreset } from "@/lib/api/dive-form-presets";
import type { DiveFormPresets } from "@/hooks/useDiveFormPresets";
import type { DiveFormVisibility } from "@/hooks/useDiveFormVisibility";

/**
 * The hideable field a group lists ahead of everything else, where it has one.
 *
 * Only `mixtures` does. It is the switch that decides whether the Gas Mixtures section
 * is on the form at all, and every other row in that group is downstream of it - the
 * three always-on cylinder columns as much as the five per-cylinder ones, which this
 * dialog disables outright while it is off. Listing it after them would put the reason
 * they are unavailable below the rows it explains. It is the form's own order too: the
 * section exists before any cylinder in it does.
 *
 * The registry stays in form order for the guard's sake; presentation order is this
 * file's business, which is why the exception lives here and not beside it.
 */
const LEADING_GROUP_FIELD: Partial<
  Record<DiveFormFieldGroup, DiveFormFieldKey>
> = {
  "Gas mixtures": "mixtures",
};

/** Which name prompt is open, and what confirming it does. */
type NamePrompt =
  { mode: "create" } | { mode: "rename"; preset: DiveFormPreset };

interface DiveFormFieldsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibility: DiveFormVisibility;
  /** Held by the Fields menu and handed down, so opening this refetches nothing. */
  presets: DiveFormPresets;
}

/**
 * Configure: every input the form can render, and the account's presets to manage.
 *
 * **A dialog rather than a panel on the card.** Nothing in it is a form control of the
 * dive, and this is the second half of the pair the Fields menu makes - the menu is
 * the quick path (pick a preset, it applies), this is the one that changes what the
 * presets are made of. Radix portals the content to `document.body`, so the DOM has no
 * nested `<form>`; the name prompt still goes through `dialogFormSubmit`, because
 * React bubbles submit events through its own tree and not the DOM's (DECISIONS.md,
 * "A dialog's submit event bubbles into the form that opened it").
 *
 * **A preset is a snapshot.** Applying one copies its hidden set into the account's
 * current state and nothing links the two afterwards, so this marks the preset whose
 * set *equals* the stored state and marks nothing when none does. Toggling a field
 * changes the state, not the preset, until the diver writes it back.
 *
 * **A switch shows the _effective_ state and edits the _stored_ one.** Turning one on
 * stores the key visible; turning it off stores it hidden *and* drops it from the
 * revealed set, so a field an edit load put on screen can still be put away from here.
 * A key visible only because it was revealed says so beside its label.
 */
export function DiveFormFieldsDialog({
  open,
  onOpenChange,
  visibility,
  presets,
}: DiveFormFieldsDialogProps) {
  const [prompt, setPrompt] = useState<NamePrompt | null>(null);
  const [promptName, setPromptName] = useState("");
  const [deleting, setDeleting] = useState<DiveFormPreset | null>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prompt) promptInputRef.current?.focus();
  }, [prompt]);

  const closePrompt = () => {
    setPrompt(null);
    setPromptName("");
  };

  const handleNamePromptSubmit = async () => {
    const name = promptName.trim();
    if (!name || !prompt) return;

    if (prompt.mode === "create") {
      await presets.createPreset(name, visibility.hidden);
    } else {
      await presets.renamePreset(prompt.preset, name);
    }
    closePrompt();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await presets.deletePreset(deleting);
    setDeleting(null);
  };

  const toggleField = (key: DiveFormFieldKey, shouldShow: boolean) => {
    const next = new Set(visibility.hidden);
    if (shouldShow) next.delete(key);
    else next.add(key);
    visibility.setHidden([...next]);
  };

  const gasOnScreen = visibility.isVisible("mixtures");

  // The always-on rows carry no key, so their switches are identified by position in
  // the one list they come from - stable for as long as the list is, which is what an
  // id has to be.
  const alwaysOnRows = DIVE_FORM_ALWAYS_ON_FIELDS.map((entry, index) => ({
    entry,
    id: `dive-form-field-always-${index}`,
  }));

  const rowsFor = (group: DiveFormFieldGroup) => {
    const hideable = DIVE_FORM_FIELD_REGISTRY.filter(
      (entry) => entry.group === group,
    );
    const leadingKey = LEADING_GROUP_FIELD[group];
    return {
      leading: hideable.filter((entry) => entry.key === leadingKey),
      fields: hideable.filter((entry) => entry.key !== leadingKey),
      alwaysOn: alwaysOnRows.filter((row) => row.entry.group === group),
    };
  };

  const fieldRow = (entry: DiveFormFieldEntry) => {
    const fieldId = `dive-form-field-${entry.key}`;
    const perCylinder = isMixtureField(entry.key);
    const revealed =
      visibility.isHidden(entry.key) && visibility.isRevealed(entry.key);
    return (
      <div key={entry.key}>
        <div className="flex items-center gap-2">
          <Switch
            id={fieldId}
            checked={visibility.isVisible(entry.key)}
            // Per-cylinder switches keep their state while the section they
            // belong to is off screen, but there is nothing on screen for them
            // to govern, so they are not offered.
            disabled={perCylinder && !gasOnScreen}
            onCheckedChange={(next) => toggleField(entry.key, next)}
          />
          <Label htmlFor={fieldId} className="font-normal">
            {entry.label}
          </Label>
        </div>
        {revealed && (
          <p className="pl-11 text-xs text-muted-foreground">
            shown because it holds a value
          </p>
        )}
      </div>
    );
  };

  const rows = presets.presets;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closePrompt();
        onOpenChange(next);
      }}
    >
      <DialogContent
        // `focus:outline-none` because the open focus goes to this container: it is
        // a focus *holder*, not a control, and the browser's own ring around the
        // whole dialog reads as an error state.
        className="sm:max-w-2xl focus:outline-none"
        // Radix focuses the first tabbable descendant on open, which here is the
        // first preset's "Update with current fields" - a button that overwrites a
        // saved preset. Enter should not be that key on a dialog the diver has only
        // just opened. `ConfirmDialog` documents the same move for the same reason.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        ref={contentRef}
      >
        <DialogHeader>
          <DialogTitle>Configure fields</DialogTitle>
          <DialogDescription>
            Choose what the dive form asks for. This is saved to your account
            and applies to every dive you log.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          {/* Managing presets, not picking one: applying is the menu's job, and a
              second way to do it here would put the quick path behind two clicks and
              a dialog. The check still marks which one the stored set matches. */}
          <h3 className="text-sm font-medium">Presets</h3>
          {presets.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading presets...</p>
          ) : rows && rows.length > 0 ? (
            <ul className="space-y-1">
              {rows.map((preset) => {
                const isCurrent = hiddenFieldsEqual(
                  preset.hidden_fields,
                  visibility.hidden,
                );
                return (
                  <li
                    key={preset.uuid}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                      {/* The mark is a check *and* a word: colour and an icon alone
                          would leave the current preset unnamed to a screen reader,
                          and `aria-current` is the attribute for "this one of a set". */}
                      {isCurrent && (
                        <Check className="h-3.5 w-3.5 text-teal" aria-hidden />
                      )}
                      <span aria-current={isCurrent ? "true" : undefined}>
                        {preset.name}
                      </span>
                      {isCurrent && (
                        <span className="sr-only">(current fields)</span>
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={presets.isWorking}
                      onClick={() =>
                        void presets.updateHiddenFields(
                          preset,
                          visibility.hidden,
                        )
                      }
                    >
                      {presets.busyUuid === preset.uuid && (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      )}
                      Update with current fields
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={presets.isWorking}
                      onClick={() => {
                        setPromptName(preset.name);
                        setPrompt({ mode: "rename", preset });
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
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No presets yet. Save the fields below as one, or restore the
              defaults.
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={presets.isWorking || Boolean(prompt)}
              onClick={() => {
                setPromptName("");
                setPrompt({ mode: "create" });
              }}
            >
              Save current fields as a preset
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={presets.isWorking}
              onClick={() => void presets.restoreDefaults()}
            >
              Restore default presets
            </Button>
          </div>

          {prompt && (
            // A `<form>` of its own so Enter confirms the name. `dialogFormSubmit`
            // stops the submit event there rather than letting React bubble it into
            // the dive form's own `onSubmit` - see "A dialog's submit event bubbles
            // into the form that opened it" in DECISIONS.md.
            <form
              className="flex flex-wrap items-end gap-2 pt-1"
              onSubmit={dialogFormSubmit((event) => {
                event?.preventDefault();
                void handleNamePromptSubmit();
              })}
            >
              <div className="space-y-1">
                <label
                  className="text-sm font-medium"
                  htmlFor="dive-form-preset-name"
                >
                  {prompt.mode === "create" ? "Preset name" : "New name"}
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

          <FormApiError error={presets.error} />
          <FormApiError error={visibility.saveError} />
        </section>

        <section className="space-y-6">
          <h3 className="text-sm font-medium">Fields on this form</h3>
          {DIVE_FORM_FIELD_GROUPS.map((group) => {
            const { leading, fields, alwaysOn } = rowsFor(group);
            if (leading.length + fields.length + alwaysOn.length === 0)
              return null;

            return (
              <fieldset key={group} className="space-y-3">
                <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group}
                </legend>
                {leading.map(fieldRow)}
                {/* The same row as a hideable field, down to the label's own colour:
                    the switch being on and unavailable is the whole of what marks it,
                    and a diver looking for Duration finds it where they would look for
                    it rather than in a gap. Named like every other switch here, since
                    with no note beside it the control is the only thing that says so. */}
                {alwaysOn.map(({ entry, id: rowId }) => (
                  <div key={rowId} className="flex items-center gap-2">
                    <Switch id={rowId} checked disabled />
                    <Label htmlFor={rowId} className="font-normal">
                      {entry.label}
                    </Label>
                  </div>
                ))}
                {fields.map(fieldRow)}
              </fieldset>
            );
          })}
        </section>
      </DialogContent>

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
    </Dialog>
  );
}
