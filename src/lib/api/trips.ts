import { apiClient } from './client';

export interface Trip {
  id: number;
  name: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  notes?: string;
  user_id: number;
  created_at: string;
}

export interface TripCreate {
  name: string;
  location?: string;
  start_date: string;
  end_date?: string;
  notes?: string;
}

export interface TripUpdate {
  name?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  notes?: string;
}

export interface PaginatedTripsResponse {
  data: Trip[];
  total_count: number;
  has_more: boolean;
  page: number;
  items_per_page: number;
}

export const tripsAPI = {
  // Create a new trip
  async createTrip(username: string, tripData: TripCreate): Promise<Trip> {
    const response = await apiClient.post(`/${username}/trip`, tripData);
    return response.data;
  },

  // Get all trips for a user (paginated)
  async getTrips(
    username: string,
    page: number = 1,
    items_per_page: number = 10
  ): Promise<PaginatedTripsResponse> {
    const response = await apiClient.get(`/${username}/trips`, {
      params: {
        page,
        items_per_page,
      },
    });
    return response.data;
  },

  // Get a specific trip by ID
  async getTrip(username: string, tripId: number): Promise<Trip> {
    const response = await apiClient.get(`/${username}/trip/${tripId}`);
    return response.data;
  },

  // Update a trip
  async updateTrip(
    username: string,
    tripId: number,
    updateData: TripUpdate
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(
      `/${username}/trip/${tripId}`,
      updateData
    );
    return response.data;
  },

  // Delete a trip
  async deleteTrip(
    username: string,
    tripId: number
  ): Promise<{ message: string }> {
    const response = await apiClient.delete(`/${username}/trip/${tripId}`);
    return response.data;
  },
};
