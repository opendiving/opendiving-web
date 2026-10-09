import { apiClient, fetchAllPages, type PaginatedResponse } from "./client";
import {
  hiddenFieldsEqual,
  type DiveFormFieldKey,
} from "@/lib/dive-form-fields";

/**
 * A named set of dive-form fields to keep hidden, saved against one account.
 *
 * A **snapshot**, not a live profile: applying one copies its `hidden_fields` into
 * `user.dive_form_hidden_fields` and nothing links the two afterwards, so toggling a
 * field changes what the diver sees and leaves the preset alone until they write it
 * back with `updatePreset`.
 *
 * `hidden_fields` comes back de-duplicated in the API's own order; `hiddenFieldsEqual`
 * puts both sides in form order before comparing, which is what lets the panel decide
 * which preset matches the current state by comparing lists.
 */
export interface DiveFormPreset {
  uuid: string;
  user_uuid: string;
  name: string;
  hidden_fields: DiveFormFieldKey[];
  created_at: string;
}

/**
 * The built-in preset every account has and none stores: every field shown. It is the
 * empty hidden set, which is what a new account starts with, so a new form reads "All".
 * Not a row, so nothing can rename, overwrite or delete it, and no saved preset may take
 * its name.
 */
export const ALL_FIELDS_PRESET_NAME = "All";

/** Whether `name` is the built-in preset's, matched as the API matches preset names. */
export function isAllFieldsPresetName(name: string): boolean {
  return name.trim().toLowerCase() === ALL_FIELDS_PRESET_NAME.toLowerCase();
}

/** Which preset the form is on, as the Fields surfaces name it. */
export type CurrentDiveFormPreset =
  | { kind: "saved"; preset: DiveFormPreset }
  | { kind: "all" }
  | { kind: "loading" }
  | { kind: "custom" };

/**
 * The preset the hidden set is on: the one the diver picked while its set still matches,
 * else the built-in "All" for nothing hidden, else the first saved one holding the set.
 *
 * Presets may hold identical sets, so the pick is what tells them apart - and a set
 * edited away from it and back is on it again. The fallbacks name a set nobody picked
 * as anything: one applied on another client before the pick was stored, or a toggle
 * that happens to land on a saved set.
 */
export function currentDiveFormPreset(
  presets: readonly DiveFormPreset[] | null,
  hidden: readonly DiveFormFieldKey[],
  pickedUuid: string | null,
): CurrentDiveFormPreset {
  const picked = presets?.find((preset) => preset.uuid === pickedUuid);
  if (picked && hiddenFieldsEqual(picked.hidden_fields, hidden)) {
    return { kind: "saved", preset: picked };
  }
  if (hidden.length === 0) return { kind: "all" };
  if (presets === null) return { kind: "loading" };
  const matching = presets.find((preset) =>
    hiddenFieldsEqual(preset.hidden_fields, hidden),
  );
  return matching ? { kind: "saved", preset: matching } : { kind: "custom" };
}

export interface DiveFormPresetCreate {
  name: string;
  hidden_fields: DiveFormFieldKey[];
}

/** A rename, a new hidden set, or both. Sending `hidden_fields` replaces it wholesale. */
export interface DiveFormPresetUpdate {
  name?: string;
  hidden_fields?: DiveFormFieldKey[];
}

export type PaginatedDiveFormPresetsResponse =
  PaginatedResponse<DiveFormPreset>;

export const diveFormPresetsAPI = {
  /**
   * Save the current hidden set under a name. 422 when the account already has a
   * preset by that name, compared case-insensitively.
   */
  async createPreset(data: DiveFormPresetCreate): Promise<DiveFormPreset> {
    const response = await apiClient.post(`/dive-form-preset`, data);
    return response.data;
  },

  /** One page of the account's presets, ordered by name. */
  async getPresets(
    page: number = 1,
    items_per_page: number = 100,
  ): Promise<PaginatedDiveFormPresetsResponse> {
    const response = await apiClient.get(`/dive-form-presets`, {
      params: { page, items_per_page },
    });
    return response.data;
  },

  async getPreset(presetUuid: string): Promise<DiveFormPreset> {
    const response = await apiClient.get(`/dive-form-preset/${presetUuid}`);
    return response.data;
  },

  /** Rename a preset and/or replace its hidden set. Returns a message, not the row. */
  async updatePreset(
    presetUuid: string,
    updateData: DiveFormPresetUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(
      `/dive-form-preset/${presetUuid}`,
      updateData,
    );
    return response.data;
  },

  async deletePreset(presetUuid: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/dive-form-preset/${presetUuid}`);
    return response.data;
  },

  /**
   * Add back whichever of the three seeded defaults - Basic, Recreational, Technical -
   * this account no longer has, matched by name case-insensitively.
   *
   * **Adds what is missing; never overwrites.** A default the diver edited keeps the
   * edit, and one they renamed stays under its new name with the original created
   * beside it. Idempotent, so it can be offered whenever the diver asks - it answers
   * with only what it created, which is what the confirmation counts.
   */
  async restoreDefaults(): Promise<DiveFormPreset[]> {
    const response = await apiClient.post(`/dive-form-presets/defaults`);
    return response.data;
  },
};

/**
 * Fetches every page of an account's dive form presets.
 *
 * The Fields menu is a list of names to pick from rather than a list view, and an
 * account has a handful of presets, so paging it would buy nothing - the same
 * reasoning as `fetchAllGearSets`, which the panel's own dropdown neighbour uses.
 */
export async function fetchAllDiveFormPresets(
  signal?: AbortSignal,
): Promise<DiveFormPreset[]> {
  return fetchAllPages(
    (page, itemsPerPage) => diveFormPresetsAPI.getPresets(page, itemsPerPage),
    { signal, label: "dive form presets", keyOf: (preset) => preset.uuid },
  );
}
