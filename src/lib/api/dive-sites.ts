import { apiClient } from "./client";

export interface DiveSite {
  id: number;
  name: string;
  location?: string;
  notes?: string;
  user_id: number;
  created_at: string;
}

export interface DiveSiteCreate {
  user_id: number;
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
  // Create a new dive site. `data.user_id` must be the currently signed-in user's id.
  async createDiveSite(data: DiveSiteCreate): Promise<DiveSite> {
    const response = await apiClient.post(`/dive-site`, data);
    return response.data;
  },

  // Get all dive sites for a user (paginated)
  async getDiveSites(
    userId: number,
    page: number = 1,
    items_per_page: number = 10,
  ): Promise<PaginatedDiveSitesResponse> {
    const response = await apiClient.get(`/dive-sites`, {
      params: {
        user_id: userId,
        page,
        items_per_page,
      },
    });
    return response.data;
  },

  // Get a specific dive site by ID
  async getDiveSite(diveSiteId: number): Promise<DiveSite> {
    const response = await apiClient.get(`/dive-site/${diveSiteId}`);
    return response.data;
  },

  // Update a dive site
  async updateDiveSite(
    diveSiteId: number,
    updateData: DiveSiteUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(
      `/dive-site/${diveSiteId}`,
      updateData,
    );
    return response.data;
  },

  // Delete a dive site
  async deleteDiveSite(diveSiteId: number): Promise<{ message: string }> {
    const response = await apiClient.delete(`/dive-site/${diveSiteId}`);
    return response.data;
  },
};
