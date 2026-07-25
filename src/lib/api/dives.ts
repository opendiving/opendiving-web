import { apiClient } from './client';

export interface Dive {
  id: number;
  dive_number: number;
  start_time: string;
  duration: number;
  max_depth?: number;
  avg_depth?: number;
  bottom_temperature?: number;
  notes: string;
  user_id: number;
  created_at: string;
}

export interface DiveCreate {
  dive_number: number;
  start_time: string;
  duration: number;
  max_depth?: number;
  avg_depth?: number;
  bottom_temperature?: number;
  notes?: string;
}

export interface DiveUpdate {
  dive_number?: number;
  start_time?: string;
  duration?: number;
  max_depth?: number;
  avg_depth?: number;
  bottom_temperature?: number;
  notes?: string;
}

export interface PaginatedDivesResponse {
  data: Dive[];
  total_count: number;
  has_more: boolean;
  page: number;
  items_per_page: number;
}

export const divesAPI = {
  // Create a new dive
  async createDive(username: string, diveData: DiveCreate): Promise<Dive> {
    const response = await apiClient.post(`/${username}/dive`, diveData);
    return response.data;
  },

  // Get all dives for a user (paginated)
  async getDives(
    username: string,
    page: number = 1,
    items_per_page: number = 10
  ): Promise<PaginatedDivesResponse> {
    const response = await apiClient.get(`/${username}/dives`, {
      params: {
        page,
        items_per_page,
      },
    });
    return response.data;
  },

  // Get a specific dive by ID
  async getDive(username: string, diveId: number): Promise<Dive> {
    const response = await apiClient.get(`/${username}/dive/${diveId}`);
    return response.data;
  },

  // Update a dive
  async updateDive(
    username: string,
    diveId: number,
    updateData: DiveUpdate
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(
      `/${username}/dive/${diveId}`,
      updateData
    );
    return response.data;
  },

  // Delete a dive
  async deleteDive(
    username: string,
    diveId: number
  ): Promise<{ message: string }> {
    const response = await apiClient.delete(`/${username}/dive/${diveId}`);
    return response.data;
  },
};
