import { apiClient } from "./client";

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
  user_id: number;
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
  // Create a new trip. `tripData.user_id` must be the currently signed-in user's id.
  async createTrip(tripData: TripCreate): Promise<Trip> {
    const response = await apiClient.post(`/trip`, tripData);
    return response.data;
  },

  // Get all trips for a user (paginated)
  async getTrips(
    userId: number,
    page: number = 1,
    items_per_page: number = 10,
  ): Promise<PaginatedTripsResponse> {
    const response = await apiClient.get(`/trips`, {
      params: {
        user_id: userId,
        page,
        items_per_page,
      },
    });
    return response.data;
  },

  // Get a specific trip by ID
  async getTrip(tripId: number): Promise<Trip> {
    const response = await apiClient.get(`/trip/${tripId}`);
    return response.data;
  },

  // Update a trip
  async updateTrip(
    tripId: number,
    updateData: TripUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(`/trip/${tripId}`, updateData);
    return response.data;
  },

  // Delete a trip
  async deleteTrip(tripId: number): Promise<{ message: string }> {
    const response = await apiClient.delete(`/trip/${tripId}`);
    return response.data;
  },
};
