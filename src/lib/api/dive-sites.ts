import { apiClient } from "./client";
import type { PaginatedResponse } from "./client";

// `latitude`/`longitude` are both-or-neither on the API, and the rule is about
// the request body rather than the resulting row: naming one without the other
// is a 422, so is naming both with only one value, and the stored row is never
// consulted. Sending both as `null` is how a position is cleared, and moving a
// site means sending both numbers even when only one changed.
// `lib/validations/dive-site.ts` enforces the same rule in the form.
export interface DiveSite {
  uuid: string;
  name: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string;
  user_uuid: string;
  created_at: string;
}

export interface DiveSiteCreate {
  name: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string;
}

export interface DiveSiteUpdate {
  name?: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string;
}

export type PaginatedDiveSitesResponse = PaginatedResponse<DiveSite>;

/**
 * Dive-site CRUD. `getDiveSites` takes a `search` the API matches server-side against
 * name and location, which is what lets the dive form's picker narrow as you type instead
 * of loading a diver's whole site list.
 */
export const diveSitesAPI = {
  // Create a new dive site, owned by the signed-in user.
  async createDiveSite(data: DiveSiteCreate): Promise<DiveSite> {
    const response = await apiClient.post(`/dive-site`, data);
    return response.data;
  },

  // Get a user's dive sites (paginated, name-ascending). `search` narrows to sites
  // whose name *or* location contains it, case-insensitively - the API caps
  // `items_per_page` at 100, so this is a page of matches, never the whole set.
  async getDiveSites(
    page: number = 1,
    items_per_page: number = 10,
    search?: string,
  ): Promise<PaginatedDiveSitesResponse> {
    const response = await apiClient.get(`/dive-sites`, {
      params: {
        page,
        items_per_page,
        ...(search ? { search } : {}),
      },
    });
    return response.data;
  },

  // Get a specific dive site by uuid
  async getDiveSite(diveSiteUuid: string): Promise<DiveSite> {
    const response = await apiClient.get(`/dive-site/${diveSiteUuid}`);
    return response.data;
  },

  // Update a dive site
  async updateDiveSite(
    diveSiteUuid: string,
    updateData: DiveSiteUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(
      `/dive-site/${diveSiteUuid}`,
      updateData,
    );
    return response.data;
  },

  /**
   * Delete a dive site, optionally moving the dives logged at it to another one
   * first.
   *
   * `moveDivesTo` swaps this site for that one across every live dive logged
   * here and deletes it **in one transaction**. The replacement takes this
   * site's place in each dive's ordered list - inheriting primary-site position
   * where this one held it - and a dive already logged at both ends up holding
   * the replacement once.
   *
   * Idempotent, with the same retry caveat as `deleteTrip`: a repeat call after
   * a lost response succeeds, because there is nothing left to move.
   *
   * A `moveDivesTo` that isn't one of the diver's own live sites, or that is
   * this site, is a 422.
   */
  async deleteDiveSite(
    diveSiteUuid: string,
    moveDivesTo?: string,
  ): Promise<{ message: string }> {
    const response = await apiClient.delete(`/dive-site/${diveSiteUuid}`, {
      params: moveDivesTo ? { move_dives_to: moveDivesTo } : undefined,
    });
    return response.data;
  },
};
