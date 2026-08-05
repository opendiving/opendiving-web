import { apiClient } from "./client";

// A single gas mixture / scuba tank used during a dive.
export interface DiveMixture {
  id?: number;
  name?: string;
  volume: number;
  start_pressure?: number;
  end_pressure?: number;
  oxygen: number;
  helium: number;
}

// A dive site visited during a dive, as embedded in a `Dive`. Dives are
// ordered by the sequence they were visited in - `dive_sites[0]` is the
// primary/first site, shown wherever only one site can be displayed.
export interface DiveSiteSummary {
  uuid: string;
  name: string;
  location?: string;
}

export interface Dive {
  uuid: string;
  dive_number: number;
  start_time: string;
  duration: number;
  max_depth?: number;
  avg_depth?: number;
  bottom_temperature?: number;
  visibility?: number;
  trip_uuid?: string;
  dive_sites: DiveSiteSummary[];
  notes: string;
  user_uuid: string;
  created_at: string;
  mixtures: DiveMixture[];
}

export interface DiveCreate {
  user_uuid: string;
  dive_number: number;
  start_time: string;
  duration: number;
  max_depth?: number | null;
  avg_depth?: number | null;
  bottom_temperature?: number | null;
  visibility?: number | null;
  trip_uuid?: string;
  dive_site_uuids?: string[];
  notes?: string;
  mixtures?: DiveMixture[];
}

export interface DiveUpdate {
  dive_number?: number;
  start_time?: string;
  duration?: number;
  max_depth?: number | null;
  avg_depth?: number | null;
  bottom_temperature?: number | null;
  visibility?: number | null;
  trip_uuid?: string;
  dive_site_uuids?: string[];
  notes?: string;
  mixtures?: DiveMixture[];
}

export interface PaginatedDivesResponse {
  data: Dive[];
  total_count: number;
  has_more: boolean;
  page: number;
  items_per_page: number;
}

// Result of parsing a dive-computer export file (e.g. Suunto XML) via /dive/parse-xml.
// Most fields are nullable since not every dive-computer format populates every field.
export interface ParsedDive {
  dive_number: number | null;
  start_time: string | null;
  duration: number | null;
  max_depth: number | null;
  avg_depth: number | null;
  bottom_temperature: number | null;
  source: string | null;
  serial_number: string | null;
  software: string | null;
  [key: string]: unknown;
}

export const divesAPI = {
  // Create a new dive. `diveData.user_uuid` must be the currently signed-in user's uuid.
  async createDive(diveData: DiveCreate): Promise<Dive> {
    const response = await apiClient.post(`/dive`, diveData);
    return response.data;
  },

  // Get all dives for a user (paginated). Pass `tripUuid`/`diveSiteUuid` to only
  // return dives that belong to a given trip / were made at a given site.
  async getDives(
    userUuid: string,
    page: number = 1,
    items_per_page: number = 10,
    tripUuid?: string,
    diveSiteUuid?: string,
  ): Promise<PaginatedDivesResponse> {
    const response = await apiClient.get(`/dives`, {
      params: {
        user_uuid: userUuid,
        page,
        items_per_page,
        ...(tripUuid !== undefined ? { trip_uuid: tripUuid } : {}),
        ...(diveSiteUuid !== undefined ? { dive_site_uuid: diveSiteUuid } : {}),
      },
    });
    return response.data;
  },

  // Get a specific dive by uuid
  async getDive(diveUuid: string): Promise<Dive> {
    const response = await apiClient.get(`/dive/${diveUuid}`);
    return response.data;
  },

  // Update a dive
  async updateDive(
    diveUuid: string,
    updateData: DiveUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(`/dive/${diveUuid}`, updateData);
    return response.data;
  },

  // Delete a dive
  async deleteDive(diveUuid: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/dive/${diveUuid}`);
    return response.data;
  },

  // Parse a dive-computer export file (e.g. Suunto XML) into structured dive data
  async parseDiveFile(file: File): Promise<ParsedDive> {
    const formData = new FormData();
    formData.append("file", file);

    // The apiClient instance has a fixed default "Content-Type: application/json" header.
    // For multipart uploads we must clear it so the browser can set the correct
    // "multipart/form-data; boundary=..." header itself.
    const response = await apiClient.post("/dive/parse-xml", formData, {
      headers: { "Content-Type": undefined },
    });
    return response.data;
  },
};
