"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api/error";
import { isAbortError } from "@/lib/api/client";
import {
  diveFormPresetsAPI,
  fetchAllDiveFormPresets,
  type DiveFormPreset,
} from "@/lib/api/dive-form-presets";
import {
  canonicalHiddenFields,
  type DiveFormFieldKey,
} from "@/lib/dive-form-fields";

/** The account's presets and the five things the Fields surfaces do to them. */
export interface DiveFormPresets {
  /** `null` until the first fetch resolves - not an empty list, which means "none". */
  presets: DiveFormPreset[] | null;
  isLoading: boolean;
  /** The API's own wording for whatever last failed, or null. */
  error: string | null;
  /** The preset a request is in flight for, so one row can show a spinner. */
  busyUuid: string | null;
  /** True while any request is in flight - what disables every button at once. */
  isWorking: boolean;
  createPreset: (
    name: string,
    hidden: readonly DiveFormFieldKey[],
  ) => Promise<void>;
  renamePreset: (preset: DiveFormPreset, name: string) => Promise<void>;
  updateHiddenFields: (
    preset: DiveFormPreset,
    hidden: readonly DiveFormFieldKey[],
  ) => Promise<void>;
  deletePreset: (preset: DiveFormPreset) => Promise<void>;
  restoreDefaults: () => Promise<void>;
}

/**
 * Owns the account's dive form presets for both surfaces that show them - the Fields
 * menu, which lists them to apply, and the Configure dialog, which manages them.
 *
 * **One instance serves both**, which is why this is a hook rather than state inside
 * either: the menu holds it and hands it to the dialog, so opening Configure does not
 * refetch a list the menu is already showing, and a rename made in the dialog is on
 * the menu the moment it closes.
 *
 * **Fetched on mount, not on first open.** The menu's own trigger is labelled with the
 * preset the stored hidden set matches - or "Custom" when none does - so the list is
 * needed to paint the button, before any diver has asked for it. That reverses the
 * lazier rule the inline Fields panel had, and knowingly: a label that says "Fields"
 * until first opened and "Technical" afterwards is worse than one small request.
 *
 * Every mutation updates the list in place rather than refetching. The API's `PATCH`
 * answers with a message rather than the row, so a refetch would be the only way to
 * see the change - one request per keystroke-sized edit, for a list this caller
 * already holds in full.
 */
export function useDiveFormPresets(): DiveFormPresets {
  const { toast } = useToast();
  const [presets, setPresets] = useState<DiveFormPreset[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const rows = await fetchAllDiveFormPresets(controller.signal);
        if (controller.signal.aborted) return;
        setPresets(rows);
      } catch (fetchError) {
        if (isAbortError(fetchError)) return;
        console.error("Failed to fetch dive form presets:", fetchError);
        setError(
          getApiErrorMessage(
            fetchError,
            "Couldn't load your saved field sets.",
          ),
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, []);

  const sortByName = (rows: DiveFormPreset[]) =>
    [...rows].sort((a, b) => a.name.localeCompare(b.name));

  const run = useCallback(
    async (uuid: string | null, action: () => Promise<void>) => {
      setError(null);
      setBusyUuid(uuid);
      setIsWorking(true);
      try {
        await action();
      } catch (actionError) {
        console.error("Dive form preset action failed:", actionError);
        setError(
          getApiErrorMessage(
            actionError,
            "That didn't work. Please try again.",
          ),
        );
      } finally {
        setBusyUuid(null);
        setIsWorking(false);
      }
    },
    [],
  );

  const createPreset = useCallback(
    (name: string, hidden: readonly DiveFormFieldKey[]) =>
      run(null, async () => {
        const created = await diveFormPresetsAPI.createPreset({
          name,
          hidden_fields: canonicalHiddenFields(hidden),
        });
        setPresets((rows) => sortByName([...(rows ?? []), created]));
        toast({
          title: "Preset saved",
          description: `"${created.name}" holds the fields on this form.`,
        });
      }),
    [run, toast],
  );

  const renamePreset = useCallback(
    (preset: DiveFormPreset, name: string) =>
      run(preset.uuid, async () => {
        await diveFormPresetsAPI.updatePreset(preset.uuid, { name });
        setPresets((rows) =>
          sortByName(
            (rows ?? []).map((row) =>
              row.uuid === preset.uuid ? { ...row, name } : row,
            ),
          ),
        );
      }),
    [run],
  );

  const updateHiddenFields = useCallback(
    (preset: DiveFormPreset, hidden: readonly DiveFormFieldKey[]) =>
      run(preset.uuid, async () => {
        const hidden_fields = canonicalHiddenFields(hidden);
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
      }),
    [run, toast],
  );

  const deletePreset = useCallback(
    (preset: DiveFormPreset) =>
      run(preset.uuid, async () => {
        await diveFormPresetsAPI.deletePreset(preset.uuid);
        setPresets((rows) =>
          (rows ?? []).filter((r) => r.uuid !== preset.uuid),
        );
        toast({
          title: "Preset deleted",
          description: `"${preset.name}" is gone. The fields on this form are unchanged.`,
        });
      }),
    [run, toast],
  );

  const restoreDefaults = useCallback(
    () =>
      run(null, async () => {
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
      }),
    [run, toast],
  );

  return {
    presets,
    isLoading,
    error,
    busyUuid,
    isWorking,
    createPreset,
    renamePreset,
    updateHiddenFields,
    deletePreset,
    restoreDefaults,
  };
}
