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
  user_uuid: string;
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
  // Create a new dive site. `data.user_uuid` must be the currently signed-in user's uuid.
  async createDiveSite(data: DiveSiteCreate): Promise<DiveSite> {
    const response = await apiClient.post(`/dive-site`, data);
    return response.data;
  },

  // Get a user's dive sites (paginated, name-ascending). `search` narrows to sites
  // whose name *or* location contains it, case-insensitively - the API caps
  // `items_per_page` at 100, so this is a page of matches, never the whole set.
  async getDiveSites(
    userUuid: string,
    page: number = 1,
    items_per_page: number = 10,
    search?: string,
  ): Promise<PaginatedDiveSitesResponse> {
    const response = await apiClient.get(`/dive-sites`, {
      params: {
        user_uuid: userUuid,
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

  // Delete a dive site
  async deleteDiveSite(diveSiteUuid: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/dive-site/${diveSiteUuid}`);
    return response.data;
  },
};
