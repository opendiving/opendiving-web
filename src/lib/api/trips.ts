import { apiClient, lookupByUuid, lookupFetcher } from "./client";
import type {
  MessageResponse,
  PaginatedResponse,
  SearchFilters,
  UuidLookupQuery,
} from "./client";
import type { Dive } from "./dives";
import type { Location } from "./location";
import type { PersonReference } from "./people";

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
  // The contact the diver stayed at during the part, by uuid. One per part: a
  // change of hotel is a new part, which is what parts are for.
  accommodation_uuid?: string | null;
  // Read off the diver's dives on no trip: how many of them the trip page shows
  // in this part's card. Absent on the parts a save hands back, which the form
  // assembled, until the trip is read again.
  candidate_count?: number;
}

/**
 * What a write sends: a part without what the API reads off the dives. Its own
 * interface rather than `TripPart`, because the API forbids unknown members on a
 * part, so a write that echoed `candidate_count` would be refused.
 */
export interface TripPartInput {
  start_date?: string | null;
  end_date?: string | null;
  location?: Location | null;
  accommodation_uuid?: string | null;
}

export interface Trip {
  uuid: string;
  name: string;
  // Ordered as the diver arranged them, not by date: a part with no dates has no
  // place in a date ordering, and the drag handle is what sets this.
  parts: TripPart[];
  // Who came along, in the diver's order - a trip's role is often none, or
  // `companion` for someone who stayed on the boat. Optional because a response
  // cached before people existed carries none.
  people?: PersonReference[];
  notes?: string;
  user_uuid: string;
  created_at: string;
  // Read off the trip's dives: how many there are, and the distinct dive sites
  // and species they record between them.
  dive_count: number;
  dive_site_count: number;
  species_count: number;
  // The deepest `max_depth` among those dives, in metres, and `null` when none
  // of them recorded one.
  max_depth: number | null;
  // Read off the diver's dives on no trip whose own day one of the parts covers:
  // the candidates the trip page shows muted, each counted once. The parts'
  // counts add up to it.
  candidate_count: number;
  // Read off the trip's own dives: the contacts they name, each once, the newest
  // dive's first.
  contact_uuids: string[];
}

/**
 * A trip stores no dates of its own. Its span is derived from its parts -
 * `tripSpan` in `lib/trip-parts.ts` - so nothing here carries `start_date`.
 */
export interface TripCreate {
  name: string;
  parts?: TripPartInput[];
  people?: PersonReference[];
  notes?: string;
}

export interface TripUpdate {
  name?: string;
  // Omitted leaves the trip's parts untouched; any array - `[]` included -
  // replaces them wholesale.
  parts?: TripPartInput[];
  // The same wholesale-replace contract as the parts.
  people?: PersonReference[];
  notes?: string;
}

/**
 * Which of a trip's candidates `addTripDives` puts on it: the dives named (one to
 * a hundred), the ones a part takes - named by its dates exactly as the trip read
 * carries them, since parts have no id - or, as `{}`, every one.
 */
export type TripDiveAddScope =
  | { dive_uuids: string[] }
  | { part: { start_date?: string; end_date?: string } }
  | Record<string, never>;

/**
 * One row of `GET /trips/lookup`: the name, which usually carries its year, and the
 * people a dive form fills in from the pick.
 */
export interface TripLookupItem {
  uuid: string;
  name: string;
  people?: PersonReference[];
}

const lookupTrips = lookupFetcher<TripLookupItem, UuidLookupQuery>(
  `/trips/lookup`,
);

/** Trip CRUD. Every call is scoped to the signed-in user by the API. */
export const tripsAPI = {
  /** Create a new trip, owned by the signed-in user. */
  async createTrip(tripData: TripCreate): Promise<Trip> {
    const response = await apiClient.post<Trip>(`/trip`, tripData);
    return response.data;
  },

  /**
   * A page of the user's trips, most recent first. `search` narrows to trips
   * whose name *or* any of whose location names contains it, case-insensitively
   * - the API caps `items_per_page` at 100, so this is a page of matches, never
   * the whole set.
   */
  async getTrips(
    page: number = 1,
    items_per_page: number = 10,
    { search }: SearchFilters = {},
  ): Promise<PaginatedResponse<Trip>> {
    const response = await apiClient.get<PaginatedResponse<Trip>>(`/trips`, {
      params: {
        page,
        items_per_page,
        ...(search ? { search } : {}),
      },
    });
    return response.data;
  },

  /**
   * A page of the diver's trips as a picker lists them, the trip last dived on at
   * or before `until` first, then never-dived trips newest first. `search` matches
   * what `getTrips` matches.
   */
  lookupTrips,

  /** The lookup rows of trips a form holds, in no particular order. */
  lookupTripsByUuid: lookupByUuid(lookupTrips),

  /**
   * Every place the caller's trips went, each once - the same place on several
   * trips appears once - for a map to frame. Parts with no place, or a place
   * with no position, are left out; a diver with no placed trips gets `[]`.
   */
  async getTripPlaces(): Promise<Location[]> {
    const response = await apiClient.get<Location[]>("/user/trip-places");
    return response.data;
  },

  /** One trip by uuid. */
  async getTrip(tripUuid: string): Promise<Trip> {
    const response = await apiClient.get<Trip>(`/trip/${tripUuid}`);
    return response.data;
  },

  /**
   * A page of the trip's dives together with its candidates - the diver's dives
   * on no trip whose own day one of its parts covers - newest first. A candidate
   * is a row whose `trip_uuid` is `null`.
   */
  async getTripDives(
    tripUuid: string,
    page: number,
    items_per_page: number,
  ): Promise<PaginatedResponse<Dive>> {
    const response = await apiClient.get<PaginatedResponse<Dive>>(
      `/trip/${tripUuid}/dives`,
      {
        params: { page, items_per_page },
      },
    );
    return response.data;
  },

  /**
   * Put some of a trip's candidates on it, in one request whatever their number.
   *
   * Answers how many were added. A dive that stopped being a candidate since the
   * page read it - moved to another trip, or deleted - is skipped rather than
   * refused, so a count short of what was asked for is how that shows. A part
   * named by dates no part of the trip carries any more is a 422.
   */
  async addTripDives(
    tripUuid: string,
    scope: TripDiveAddScope,
  ): Promise<{ added: number }> {
    const response = await apiClient.post<{ added: number }>(
      `/trip/${tripUuid}/dives`,
      scope,
    );
    return response.data;
  },

  /** Update a trip. The API answers with a status message, not the trip. */
  async updateTrip(
    tripUuid: string,
    updateData: TripUpdate,
  ): Promise<MessageResponse> {
    const response = await apiClient.patch<MessageResponse>(
      `/trip/${tripUuid}`,
      updateData,
    );
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
  ): Promise<MessageResponse> {
    const response = await apiClient.delete<MessageResponse>(
      `/trip/${tripUuid}`,
      {
        params: moveDivesTo ? { move_dives_to: moveDivesTo } : undefined,
      },
    );
    return response.data;
  },
};
