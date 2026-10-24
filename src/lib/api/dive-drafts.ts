import { announceServiceDueChanged } from "@/lib/service-due";
import { apiClient } from "./client";
import type { MessageResponse, PaginatedResponse } from "./client";
import type {
  Dive,
  DiveCreate,
  DiveCurrent,
  DiveType,
  DiveWaves,
  DiveWeather,
  EntryType,
  GasRole,
  SightingAbundance,
  TankUsage,
  WaterType,
} from "./dives";
import type { PersonReference } from "./people";

/** One cylinder of a draft, on the way in: `DiveMixtureWrite`'s members, none bounded. */
export interface DiveDraftMixture {
  volume?: number;
  start_pressure?: number;
  end_pressure?: number;
  oxygen?: number;
  helium?: number;
  po2_limit?: number;
  gas_number?: number;
  role?: GasRole;
  usage?: TankUsage;
  gear_item_uuid?: string | null;
}

/** One sighting of a draft, on the way in. The species is the one member it needs. */
export interface DiveDraftSighting {
  species_uuid: string;
  count?: number;
  abundance?: SightingAbundance;
  notes?: string;
}

/**
 * A draft's values on the way in: `DiveCreate`'s members, every one optional and
 * none bounded. The API refuses a wrong type, a word outside a vocabulary, a start
 * time without an offset, a sighting without a species and a member `DiveCreate`
 * lacks - so a body is built by `buildDiveDraftValues`, which leaves out whatever
 * the form holds that would be any of those.
 */
export interface DiveDraftValues {
  dive_number?: number;
  start_time?: string;
  // Seconds, as `DiveCreate.submerged_time`.
  submerged_time?: number;
  max_depth?: number;
  avg_depth?: number;
  bottom_temperature?: number;
  visibility?: number;
  weight?: number;
  water_type?: WaterType;
  altitude?: number;
  type?: DiveType;
  rating?: number;
  air_temperature?: number;
  current?: DiveCurrent;
  waves?: DiveWaves;
  weather?: DiveWeather;
  entry_type?: EntryType;
  boat_name?: string;
  notes?: string;
  trip_uuid?: string;
  course_uuid?: string;
  contact_uuid?: string;
  mixtures?: DiveDraftMixture[];
  dive_site_uuids?: string[];
  gear_item_uuids?: string[];
  sightings?: DiveDraftSighting[];
  people?: PersonReference[];
  tags?: string[];
}

/**
 * A draft's values as the API reads them back: every member present, `null` where
 * the draft holds none, vocabularies as plain strings. A reference to a record the
 * account no longer holds is already gone from it.
 */
export interface DiveDraftValuesRead {
  dive_number: number | null;
  start_time: string | null;
  submerged_time: number | null;
  max_depth: number | null;
  avg_depth: number | null;
  bottom_temperature: number | null;
  visibility: number | null;
  weight: number | null;
  water_type: string | null;
  altitude: number | null;
  type: string | null;
  rating: number | null;
  air_temperature: number | null;
  current: string | null;
  waves: string | null;
  weather: string | null;
  entry_type: string | null;
  boat_name: string | null;
  notes: string | null;
  trip_uuid: string | null;
  course_uuid: string | null;
  contact_uuid: string | null;
  mixtures:
    | {
        volume: number | null;
        start_pressure: number | null;
        end_pressure: number | null;
        oxygen: number | null;
        helium: number | null;
        po2_limit: number | null;
        gas_number: number | null;
        role: string | null;
        usage: string | null;
        gear_item_uuid: string | null;
      }[]
    | null;
  dive_site_uuids: string[] | null;
  gear_item_uuids: string[] | null;
  sightings:
    | {
        species_uuid: string;
        count: number | null;
        abundance: string | null;
        notes: string;
      }[]
    | null;
  people: PersonReference[] | null;
  tags: string[] | null;
}

/**
 * A dive not yet logged, as `GET /dive-draft/{uuid}` returns it. `gear_set_uuid`
 * is the set the OpenDiving app loaded as its checklist; the items ticked on it
 * are `values.gear_item_uuids`. The web loads no set, so it never writes this.
 */
export interface DiveDraft {
  uuid: string;
  created_at: string;
  updated_at: string;
  gear_set_uuid: string | null;
  values: DiveDraftValuesRead;
}

/**
 * The account's dive drafts. A draft is created and edited from either the web or
 * the OpenDiving app, and logging one creates the dive and deletes the draft in
 * one request.
 */
export const diveDraftsAPI = {
  /** A page of the account's drafts, the most recently changed first. */
  async getDrafts(
    page: number = 1,
    items_per_page: number = 10,
  ): Promise<PaginatedResponse<DiveDraft>> {
    const response = await apiClient.get<PaginatedResponse<DiveDraft>>(
      `/dive-drafts`,
      { params: { page, items_per_page } },
    );
    return response.data;
  },

  /** One draft by uuid - a 404 once it has been logged or discarded. */
  async getDraft(draftUuid: string): Promise<DiveDraft> {
    const response = await apiClient.get<DiveDraft>(`/dive-draft/${draftUuid}`);
    return response.data;
  },

  /** Save the form's state as a new draft. */
  async createDraft(values: DiveDraftValues): Promise<DiveDraft> {
    const response = await apiClient.post<DiveDraft>(`/dive-draft`, {
      values,
    });
    return response.data;
  },

  /**
   * Replace a draft's values with the form's whole state: a member left out is no
   * longer in the draft. The loaded gear set is not sent, so the app's stays.
   */
  async updateDraft(
    draftUuid: string,
    values: DiveDraftValues,
  ): Promise<MessageResponse> {
    const response = await apiClient.patch<MessageResponse>(
      `/dive-draft/${draftUuid}`,
      { values },
    );
    return response.data;
  },

  /** Discard a draft. */
  async deleteDraft(draftUuid: string): Promise<MessageResponse> {
    const response = await apiClient.delete<MessageResponse>(
      `/dive-draft/${draftUuid}`,
    );
    return response.data;
  },

  /**
   * Log a draft: the dive is created exactly as `divesAPI.createDive` creates it,
   * and the draft deleted in the same commit. A refused dive leaves the draft.
   */
  async logDraft(draftUuid: string, dive: DiveCreate): Promise<Dive> {
    const response = await apiClient.post<Dive>(
      `/dive-draft/${draftUuid}/dive`,
      dive,
    );
    announceServiceDueChanged();
    return response.data;
  },
};
