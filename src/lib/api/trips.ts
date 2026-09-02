import { apiClient } from "./client";
import type { PaginatedResponse } from "./client";

/**
 * One place a trip went, as the API stores it.
 *
 * A value object, not a resource: it has no uuid, it belongs to exactly one
 * trip, and it is a snapshot of what the geocoder said at the time rather than a
 * row in a shared gazetteer. `name` is the only field that is always there - a
 * place typed in by hand, because the geocoder had nothing for it, has a name
 * and nothing else.
 */
export interface TripLocation {
  name: string;
  display_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  bbox_south?: number | null;
  bbox_north?: number | null;
  bbox_west?: number | null;
  bbox_east?: number | null;
}

// What a write sends. Identical in shape to `TripLocation` - locations are
// replaced wholesale rather than patched, so there is nothing extra to send and
// nothing read-only to strip.
export type TripLocationInput = TripLocation;

export interface Trip {
  uuid: string;
  name: string;
  // Ordered as the diver arranged them; first is the one a compact surface shows.
  locations: TripLocation[];
  start_date?: string;
  end_date?: string;
  notes?: string;
  user_uuid: string;
  created_at: string;
}

export interface TripCreate {
  user_uuid: string;
  name: string;
  locations?: TripLocationInput[];
  start_date: string;
  end_date?: string;
  notes?: string;
}

export interface TripUpdate {
  name?: string;
  // Omitted leaves the trip's locations untouched; any array - `[]` included -
  // replaces them wholesale.
  locations?: TripLocationInput[];
  start_date?: string;
  end_date?: string;
  notes?: string;
}

export type PaginatedTripsResponse = PaginatedResponse<Trip>;

/** Trip CRUD. Every call is scoped to the signed-in user by the API. */
export const tripsAPI = {
  // Create a new trip. `tripData.user_uuid` must be the currently signed-in user's uuid.
  async createTrip(tripData: TripCreate): Promise<Trip> {
    const response = await apiClient.post(`/trip`, tripData);
    return response.data;
  },

  // Get a user's trips (paginated, most recent first). `search` narrows to trips
  // whose name *or* any of whose location names contains it, case-insensitively
  // - the API caps `items_per_page` at 100, so this is a page of matches, never
  // the whole set.
  async getTrips(
    userUuid: string,
    page: number = 1,
    items_per_page: number = 10,
    search?: string,
  ): Promise<PaginatedTripsResponse> {
    const response = await apiClient.get(`/trips`, {
      params: {
        user_uuid: userUuid,
        page,
        items_per_page,
        ...(search ? { search } : {}),
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

  /**
   * Delete a trip, optionally moving its dives onto another one first.
   *
   * `moveDivesTo` re-points every one of the diver's live dives on this trip and
   * deletes it **in one transaction**: either the log ends up on the replacement
   * and this trip is gone, or nothing happened. The response says only that the
   * trip is gone - the toast names the destination from the picker that chose
   * it, since the API has no reason to know what it is called.
   *
   * Idempotent: deleting an already-deleted trip succeeds rather than 404ing,
   * and `moveDivesTo` is still honoured on one, since those dives are still
   * attached. A retry after a lost response is therefore safe.
   *
   * A `moveDivesTo` that isn't one of the diver's own live trips, or that is
   * this trip, is a 422 - the same answer `PATCH /dive` gives for a `trip_uuid`
   * it can't resolve.
   */
  async deleteTrip(
    tripUuid: string,
    moveDivesTo?: string,
  ): Promise<{ message: string }> {
    const response = await apiClient.delete(`/trip/${tripUuid}`, {
      params: moveDivesTo ? { move_dives_to: moveDivesTo } : undefined,
    });
    return response.data;
  },
};
