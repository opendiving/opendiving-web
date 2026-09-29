import { apiClient, fetchAllPages } from "./client";
import type { PaginatedResponse } from "./client";

/**
 * The longest tag the API stores, in code points: DiveJSON's bound on one, and
 * the width of the column behind it (`TAG_NAME_MAX`).
 */
export const TAG_NAME_MAX = 64;

/**
 * One of the diver's tags - a word they file dives under, and the vocabulary the
 * dive form's picker completes from.
 *
 * A record rather than a string on each dive, so a rename reaches every dive
 * carrying it and the list can filter by one. It stays when its last dive drops
 * it: `dive_count` may be zero, and only a delete removes it.
 */
export interface Tag {
  uuid: string;
  name: string;
  /** Live dives carrying it. */
  dive_count: number;
  created_at: string;
  updated_at?: string | null;
}

export type PaginatedTagsResponse = PaginatedResponse<Tag>;

/**
 * Tag reads, renames and deletes. There is no create: a dive write names its
 * tags and creates the ones the diver lacks. Every call is scoped to the
 * signed-in user by the API.
 */
export const tagsAPI = {
  /**
   * A page of the diver's tags, by name. `search` narrows server-side to tags
   * whose name contains it, case-insensitively.
   */
  async getTags(
    page: number = 1,
    items_per_page: number = 10,
    search?: string,
  ): Promise<PaginatedTagsResponse> {
    const response = await apiClient.get(`/tags`, {
      params: {
        page,
        items_per_page,
        ...(search ? { search } : {}),
      },
    });
    return response.data;
  },

  /**
   * Rename a tag; every dive carrying it carries the new name. The API trims the
   * name, and one another of the diver's tags has once both are case-folded is a
   * 422 naming the clash. A change of case alone is a rename like any other.
   */
  async renameTag(tagUuid: string, name: string): Promise<{ message: string }> {
    const response = await apiClient.patch(`/tag/${tagUuid}`, { name });
    return response.data;
  },

  /**
   * Delete a tag. It leaves every dive that carried it, and nothing else about
   * those dives changes. A second delete on the same uuid is a 404.
   */
  async deleteTag(tagUuid: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/tag/${tagUuid}`);
    return response.data;
  },
};

/**
 * Every tag the diver has, for the surfaces that offer them whole - the dive
 * form's picker, the dive list's filter and the Tags card. A diver keeps a
 * handful, so this is one request for anyone realistic, and it stops at
 * `fetchAllPages`' ceiling with a warning as the people read does.
 */
export async function fetchAllTags(signal?: AbortSignal): Promise<Tag[]> {
  return fetchAllPages(
    (page, itemsPerPage) => tagsAPI.getTags(page, itemsPerPage),
    { signal, label: "tags", keyOf: (tag) => tag.uuid },
  );
}

/**
 * The comparison the picker makes to tell whether a typed name is one the dive
 * already carries: trimmed and lowercased. Advisory only - the API folds with
 * Unicode case folding, which `Großes Riff` and `GROSSES RIFF` agree under and
 * lowercasing does not, and its answer is the one a saved dive shows.
 */
export function tagKey(name: string): string {
  return name.trim().toLowerCase();
}
