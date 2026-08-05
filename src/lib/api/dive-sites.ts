import { apiClient } from "./client";

export interface DiveSite {
  uuid: string;
  name: string;
  location?: string;
  notes?: string;
  user_uuid: string;
  created_at: string;
}

export interface DiveSiteCreate {
  user_uuid: string;
  name: string;
  location?: string;
  notes?: string;
}

export interface DiveSiteUpdate {
  name?: string;
  location?: string;
  notes?: string;
}

export interface PaginatedDiveSitesResponse {
  data: DiveSite[];
  total_count: number;
  has_more: boolean;
  page: number;
  items_per_page: number;
}

export const diveSitesAPI = {
  // Create a new dive site. `data.user_uuid` must be the currently signed-in user's uuid.
  async createDiveSite(data: DiveSiteCreate): Promise<DiveSite> {
    const response = await apiClient.post(`/dive-site`, data);
    return response.data;
  },

  // Get all dive sites for a user (paginated)
  async getDiveSites(
    userUuid: string,
    page: number = 1,
    items_per_page: number = 10,
  ): Promise<PaginatedDiveSitesResponse> {
    const response = await apiClient.get(`/dive-sites`, {
      params: {
        user_uuid: userUuid,
        page,
        items_per_page,
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
