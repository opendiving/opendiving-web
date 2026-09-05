"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormApiError } from "@/components/ui/form-api-error";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { dialogFormSubmit } from "@/lib/dialog-form";
import { getApiErrorMessage } from "@/lib/api/error";
import { isAbortError } from "@/lib/api/client";
import {
  DIVE_FORM_ALWAYS_ON_FIELDS,
  DIVE_FORM_FIELD_GROUPS,
  DIVE_FORM_FIELD_REGISTRY,
  canonicalHiddenFields,
  hiddenFieldsEqual,
  isMixtureField,
  type DiveFormFieldGroup,
  type DiveFormFieldKey,
} from "@/lib/dive-form-fields";
import {
  diveFormPresetsAPI,
  fetchAllDiveFormPresets,
  type DiveFormPreset,
} from "@/lib/api/dive-form-presets";
import type { DiveFormVisibility } from "@/hooks/useDiveFormVisibility";

/**
 * The disclosure control for the Fields panel, parked at the end of the card's title
 * row.
 *
 * **Positioned rather than laid out**, for the reason `EntryUnitLabelRow` documents
 * one component over: a flex row would give the button a say in the header's height,
 * and the header has to occupy the same vertical space with this control as without
 * it. Taking it out of flow settles that without anything here knowing how tall a
 * button is.
 *
 * `type="button"` because this renders on a card whose content is a `<form>` and the
 * default type submits - the same guard every control in that form carries.
 */
export function DiveFormFieldsToggle({
  open,
  panelId,
  onToggle,
}: {
  open: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  return (
    <span className="absolute inset-y-0 right-0 flex items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs leading-none text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Fields
      </button>
    </span>
  );
}

interface DiveFormFieldsPanelProps {
  id: string;
  visibility: DiveFormVisibility;
  /** The signed-in diver, whose presets these are - the API refuses anyone else's. */
  userId: string;
}

/** Which name prompt is open, and what confirming it does. */
type NamePrompt =
  { mode: "create" } | { mode: "rename"; preset: DiveFormPreset };

/**
 * The Fields panel: every input the form can render, and the account's presets.
 *
 * One panel rather than a control per field, deliberately. A per-field hide control
 * would sit in the label row, which is the exact place `EntryUnitLabelRow` spent an
 * owner sighting and several rounds on; this adds nothing to any label row, and it is
 * where the presets have to live anyway.
 *
 * **A preset is a snapshot.** Applying one copies its hidden set into the account's
 * current state and nothing links the two afterwards, so the panel marks the preset
 * whose set *equals* the stored state and marks nothing when none does. Toggling a
 * field changes the state, not the preset, until the diver writes it back.
 *
 * The list is fetched when the panel first opens rather than with the form: a diver
 * who never opens this pays nothing for it.
 */
export function DiveFormFieldsPanel({
  id,
  visibility,
  userId,
}: DiveFormFieldsPanelProps) {
  const { toast } = useToast();
  const [presets, setPresets] = useState<DiveFormPreset[] | null>(null);
  const [isLoadingPresets, setIsLoadingPresets] = useState(true);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [busyPresetUuid, setBusyPresetUuid] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [prompt, setPrompt] = useState<NamePrompt | null>(null);
  const [promptName, setPromptName] = useState("");
  const [deleting, setDeleting] = useState<DiveFormPreset | null>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();

    const load = async () => {
      try {
        const rows = await fetchAllDiveFormPresets(userId, controller.signal);
        if (controller.signal.aborted) return;
        setPresets(rows);
      } catch (error) {
        if (isAbortError(error)) return;
        console.error("Failed to fetch dive form presets:", error);
        setPresetError(
          getApiErrorMessage(error, "Couldn't load your saved field sets."),
        );
      } finally {
        if (!controller.signal.aborted) setIsLoadingPresets(false);
      }
    };

    load();
    return () => controller.abort();
  }, [userId]);

  useEffect(() => {
    if (prompt) promptInputRef.current?.focus();
  }, [prompt]);

  const sortByName = (rows: DiveFormPreset[]) =>
    [...rows].sort((a, b) => a.name.localeCompare(b.name));

  const runPresetAction = useCallback(
    async (uuid: string | null, action: () => Promise<void>) => {
      setPresetError(null);
      setBusyPresetUuid(uuid);
      setIsWorking(true);
      try {
        await action();
      } catch (error) {
        console.error("Dive form preset action failed:", error);
        setPresetError(
          getApiErrorMessage(error, "That didn't work. Please try again."),
        );
      } finally {
        setBusyPresetUuid(null);
        setIsWorking(false);
      }
    },
    [],
  );

  const handleApply = (preset: DiveFormPreset) => {
    visibility.setHidden(preset.hidden_fields);
  };

  const handleUpdateWithCurrent = (preset: DiveFormPreset) =>
    runPresetAction(preset.uuid, async () => {
      const hidden_fields = canonicalHiddenFields(visibility.hidden);
      await diveFormPresetsAPI.updatePreset(preset.uuid, { hidden_fields });
      setPresets((rows) =>
        (rows ?? []).map((row) =>
          row.uuid === preset.uuid ? { ...row, hidden_fields } : row,
        ),
      );
      toast({
        title: "Preset updated",
        description: `"${preset.name}" now matches the fields on this form.`,
      });
    });

  const handleNamePromptSubmit = () => {
    const name = promptName.trim();
    if (!name || !prompt) return;

    if (prompt.mode === "create") {
      void runPresetAction(null, async () => {
        const created = await diveFormPresetsAPI.createPreset({
          user_uuid: userId,
          name,
          hidden_fields: canonicalHiddenFields(visibility.hidden),
        });
        setPresets((rows) => sortByName([...(rows ?? []), created]));
        setPrompt(null);
        setPromptName("");
        toast({
          title: "Preset saved",
          description: `"${created.name}" holds the fields on this form.`,
        });
      });
      return;
    }

    const preset = prompt.preset;
    void runPresetAction(preset.uuid, async () => {
      await diveFormPresetsAPI.updatePreset(preset.uuid, { name });
      setPresets((rows) =>
        sortByName(
          (rows ?? []).map((row) =>
            row.uuid === preset.uuid ? { ...row, name } : row,
          ),
        ),
      );
      setPrompt(null);
      setPromptName("");
    });
  };

  const handleDelete = () => {
    const preset = deleting;
    if (!preset) return;
    void runPresetAction(preset.uuid, async () => {
      await diveFormPresetsAPI.deletePreset(preset.uuid);
      setPresets((rows) => (rows ?? []).filter((r) => r.uuid !== preset.uuid));
      setDeleting(null);
      toast({
        title: "Preset deleted",
        description: `"${preset.name}" is gone. The fields on this form are unchanged.`,
      });
    });
  };

  const handleRestoreDefaults = () =>
    runPresetAction(null, async () => {
      const created = await diveFormPresetsAPI.restoreDefaults();
      setPresets((rows) => sortByName([...(rows ?? []), ...created]));
      toast({
        title: "Default presets restored",
        description:
          created.length === 0
            ? "You already have all three."
            : `Added ${created.length === 1 ? "1 preset" : `${created.length} presets`}: ${created
                .map((preset) => preset.name)
                .join(", ")}.`,
      });
    });

  const toggleField = (key: DiveFormFieldKey, shouldShow: boolean) => {
    const next = new Set(visibility.hidden);
    if (shouldShow) next.delete(key);
    else next.add(key);
    visibility.setHidden([...next]);
  };

  const gasOnScreen = visibility.isVisible("mixtures");

  const rowsFor = (group: DiveFormFieldGroup) => ({
    fields: DIVE_FORM_FIELD_REGISTRY.filter((entry) => entry.group === group),
    alwaysOn: DIVE_FORM_ALWAYS_ON_FIELDS.filter(
      (entry) => entry.group === group,
    ),
  });

  return (
    <div id={id} className="border-t px-6 py-4 space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Field presets</h3>
        {isLoadingPresets ? (
          <p className="text-sm text-muted-foreground">Loading presets...</p>
        ) : presets && presets.length > 0 ? (
          <ul className="space-y-1">
            {presets.map((preset) => {
              const isCurrent = hiddenFieldsEqual(
                preset.hidden_fields,
                visibility.hidden,
              );
              return (
                <li
                  key={preset.uuid}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="flex min-w-[8rem] items-center gap-1.5 text-sm">
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
                    variant="outline"
                    size="sm"
                    disabled={isWorking}
                    onClick={() => handleApply(preset)}
                  >
                    Apply
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isWorking}
                    onClick={() => void handleUpdateWithCurrent(preset)}
                  >
                    {busyPresetUuid === preset.uuid && (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    )}
                    Update with current fields
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isWorking}
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
                    disabled={isWorking}
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
            disabled={isWorking || Boolean(prompt)}
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
            disabled={isWorking}
            onClick={() => void handleRestoreDefaults()}
          >
            Restore default presets
          </Button>
        </div>

        {prompt && (
          // A `<form>` of its own so Enter confirms the name. `dialogFormSubmit`
          // stops the submit event there rather than letting React bubble it into
          // the dive form's own `onSubmit` - see "A dialog's submit event bubbles
          // into the form that opened it" in DECISIONS.md. This panel renders
          // outside that `<form>` today, so the wrapper is belt and braces; it is
          // the cheap half of the pair that has already cost this repo a bug.
          <form
            className="flex flex-wrap items-end gap-2 pt-1"
            onSubmit={dialogFormSubmit((event) => {
              event?.preventDefault();
              handleNamePromptSubmit();
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
              disabled={isWorking || promptName.trim().length === 0}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isWorking}
              onClick={() => {
                setPrompt(null);
                setPromptName("");
              }}
            >
              Cancel
            </Button>
          </form>
        )}

        <FormApiError error={presetError} />
        <FormApiError error={visibility.saveError} />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Fields on this form</h3>
        {DIVE_FORM_FIELD_GROUPS.map((group) => {
          const { fields, alwaysOn } = rowsFor(group);
          if (fields.length === 0 && alwaysOn.length === 0) return null;

          return (
            <fieldset key={group} className="space-y-1">
              <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group}
              </legend>
              {alwaysOn.map((entry) => (
                <p
                  key={entry.label}
                  className="pl-6 text-sm text-muted-foreground"
                >
                  {entry.label}{" "}
                  <span className="text-xs">&mdash; always shown</span>
                </p>
              ))}
              {fields.map((entry) => {
                const perCylinder = isMixtureField(entry.key);
                const revealed =
                  visibility.isHidden(entry.key) &&
                  visibility.isRevealed(entry.key);
                return (
                  <div key={entry.key}>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={visibility.isVisible(entry.key)}
                        // Per-cylinder boxes keep their state while the section
                        // they belong to is off screen, but there is nothing on
                        // screen for them to govern, so they are not offered.
                        disabled={perCylinder && !gasOnScreen}
                        onChange={(event) =>
                          toggleField(entry.key, event.target.checked)
                        }
                      />
                      <span>{entry.label}</span>
                    </label>
                    {revealed && (
                      <p className="pl-6 text-xs text-muted-foreground">
                        shown because it holds a value
                      </p>
                    )}
                  </div>
                );
              })}
            </fieldset>
          );
        })}
      </section>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this preset?"
        description={
          deleting
            ? `"${deleting.name}" will be removed. The fields on this form stay as they are.`
            : undefined
        }
        confirmText="Delete"
        isLoading={isWorking}
        onConfirm={handleDelete}
      />
    </div>
  );
}
