import { apiClient } from "./client";

export interface Trip {
  uuid: string;
  name: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  notes?: string;
  user_uuid: string;
  created_at: string;
}

export interface TripCreate {
  user_uuid: string;
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
  // Create a new trip. `tripData.user_uuid` must be the currently signed-in user's uuid.
  async createTrip(tripData: TripCreate): Promise<Trip> {
    const response = await apiClient.post(`/trip`, tripData);
    return response.data;
  },

  // Get all trips for a user (paginated)
  async getTrips(
    userUuid: string,
    page: number = 1,
    items_per_page: number = 10,
  ): Promise<PaginatedTripsResponse> {
    const response = await apiClient.get(`/trips`, {
      params: {
        user_uuid: userUuid,
        page,
        items_per_page,
      },
    });
    return response.data;
  },

  // Get a specific trip by uuid
  async getTrip(tripUuid: string): Promise<Trip> {
    const response = await apiClient.get(`/trip/${tripUuid}`);
    return response.data;
  },

  // Update a trip
  async updateTrip(
    tripUuid: string,
    updateData: TripUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(`/trip/${tripUuid}`, updateData);
    return response.data;
  },

  // Delete a trip
  async deleteTrip(tripUuid: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/trip/${tripUuid}`);
    return response.data;
  },
};
