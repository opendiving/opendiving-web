import { apiClient, fetchAllPages, type PaginatedResponse } from "./client";
import type { DiveFormFieldKey } from "@/lib/dive-form-fields";

/**
 * A named set of dive-form fields to keep hidden, saved against one account.
 *
 * A **snapshot**, not a live profile: applying one copies its `hidden_fields` into
 * `user.dive_form_hidden_fields` and nothing links the two afterwards, so toggling a
 * field changes what the diver sees and leaves the preset alone until they write it
 * back with `updatePreset`.
 *
 * `hidden_fields` always comes back canonical - form order, duplicates collapsed -
 * which is what lets the panel decide which preset matches the current state by
 * comparing lists (`hiddenFieldsEqual`).
 */
export interface DiveFormPreset {
  uuid: string;
  user_uuid: string;
  name: string;
  hidden_fields: DiveFormFieldKey[];
  created_at: string;
}

export interface DiveFormPresetCreate {
  user_uuid: string;
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
    userUuid: string,
    page: number = 1,
    items_per_page: number = 100,
  ): Promise<PaginatedDiveFormPresetsResponse> {
    const response = await apiClient.get(`/dive-form-presets`, {
      params: { user_uuid: userUuid, page, items_per_page },
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
  userUuid: string,
  signal?: AbortSignal,
): Promise<DiveFormPreset[]> {
  return fetchAllPages(
    (page, itemsPerPage) =>
      diveFormPresetsAPI.getPresets(userUuid, page, itemsPerPage),
    { signal, label: "dive form presets", keyOf: (preset) => preset.uuid },
  );
}
