import { apiClient } from "./client";
import type { PaginatedResponse } from "./client";
import type { Location } from "./location";

/**
 * One stretch of a trip: an optional date range and an optional place.
 *
 * Both halves are optional and each absence means something. Dates and no place
 * is a transit day or a week nobody geocoded; a place and no dates is a stop
 * whose timing has not been filled in. A part carries no name of its own -
 * `location.name` is the place's name, and a part without one is identified by
 * its dates, or by its ordinal when it has neither.
 */
export interface TripPart {
  start_date?: string | null;
  end_date?: string | null;
  location?: Location | null;
}

// What a write sends. Identical in shape to `TripPart` - parts are replaced
// wholesale rather than patched, so there is nothing extra to send and nothing
// read-only to strip.
export type TripPartInput = TripPart;

export interface Trip {
  uuid: string;
  name: string;
  // Ordered as the diver arranged them, not by date: a part with no dates has no
  // place in a date ordering, and the drag handle is what sets this.
  parts: TripPart[];
  notes?: string;
  user_uuid: string;
  created_at: string;
}

// A trip stores no dates of its own. Its span is derived from its parts -
// `tripSpan` in `lib/trip-parts.ts` - so nothing here carries `start_date`.
export interface TripCreate {
  name: string;
  parts?: TripPartInput[];
  notes?: string;
}

export interface TripUpdate {
  name?: string;
  // Omitted leaves the trip's parts untouched; any array - `[]` included -
  // replaces them wholesale.
  parts?: TripPartInput[];
  notes?: string;
}

export type PaginatedTripsResponse = PaginatedResponse<Trip>;

/** Trip CRUD. Every call is scoped to the signed-in user by the API. */
export const tripsAPI = {
  // Create a new trip, owned by the signed-in user.
  async createTrip(tripData: TripCreate): Promise<Trip> {
    const response = await apiClient.post(`/trip`, tripData);
    return response.data;
  },

  // Get a user's trips (paginated, most recent first). `search` narrows to trips
  // whose name *or* any of whose location names contains it, case-insensitively
  // - the API caps `items_per_page` at 100, so this is a page of matches, never
  // the whole set.
  async getTrips(
    page: number = 1,
    items_per_page: number = 10,
    search?: string,
  ): Promise<PaginatedTripsResponse> {
    const response = await apiClient.get(`/trips`, {
      params: {
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
