import { apiClient } from './client';

export interface DiveSite {
  id: number;
  name: string;
  user_id: number;
  created_at: string;
}

export interface DiveSiteCreate {
  name: string;
}

export interface DiveSiteUpdate {
  name?: string;
}

export interface PaginatedDiveSitesResponse {
  data: DiveSite[];
  total_count: number;
  has_more: boolean;
  page: number;
  items_per_page: number;
}

export const diveSitesAPI = {
  // Create a new dive site
  async createDiveSite(username: string, data: DiveSiteCreate): Promise<DiveSite> {
    const response = await apiClient.post(`/${username}/dive-site`, data);
    return response.data;
  },

  // Get all dive sites for a user (paginated)
  async getDiveSites(
    username: string,
    page: number = 1,
    items_per_page: number = 10
  ): Promise<PaginatedDiveSitesResponse> {
    const response = await apiClient.get(`/${username}/dive-sites`, {
      params: {
        page,
        items_per_page,
      },
    });
    return response.data;
  },

  // Get a specific dive site by ID
  async getDiveSite(username: string, diveSiteId: number): Promise<DiveSite> {
    const response = await apiClient.get(`/${username}/dive-site/${diveSiteId}`);
    return response.data;
  },

  // Update a dive site
  async updateDiveSite(
    username: string,
    diveSiteId: number,
    updateData: DiveSiteUpdate
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(
      `/${username}/dive-site/${diveSiteId}`,
      updateData
    );
    return response.data;
  },

  // Delete a dive site
  async deleteDiveSite(
    username: string,
    diveSiteId: number
  ): Promise<{ message: string }> {
    const response = await apiClient.delete(`/${username}/dive-site/${diveSiteId}`);
    return response.data;
  },
};
