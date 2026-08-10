import { apiClient } from "./client";
import { GearItemSummary } from "./gear";

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

// Surface-normalized gas consumption for a dive, derived by the API from the
// dive's duration, average depth and cylinder pressures - see the API's
// `services/dive_gas.py` for the arithmetic and the assumptions baked into it.
//
// Deliberately *not* recomputed in the browser, unlike gear service status:
// that one depends on today's date, so a cached value would be a lie, whereas
// this is a pure function of stored fields and can never go stale. There is one
// implementation of the formula and it lives in the API.
export interface DiveGasUse {
  // Gas breathed, in liters at surface pressure.
  gas_used: number;
  // Respiratory minute volume: liters/minute at surface pressure. Independent
  // of cylinder size, so this is the figure to compare across dives.
  rmv: number;
  // The same consumption as a pressure drop rate, meaningful only alongside
  // this dive's cylinder volume - but it's what a pressure gauge shows.
  sac_bar_per_min: number;
}

export interface Dive {
  uuid: string;
  dive_number: number;
  // Offset-aware ISO 8601, e.g. "2021-04-04T10:04:47.910+02:00" - the offset
  // is the dive's own original timezone (see `lib/date-time.ts`'s
  // "UTC-offset-aware dive `start_time` helpers"), not the viewer's.
  start_time: string;
  duration: number;
  max_depth?: number;
  avg_depth?: number;
  bottom_temperature?: number;
  visibility?: number;
  // Total ballast carried on the dive, in kilograms. A plain per-dive number
  // rather than a gear item - see the API's DECISIONS.md.
  weight?: number;
  trip_uuid?: string;
  dive_sites: DiveSiteSummary[];
  // Gear used on the dive. A dive records the items themselves, never the gear
  // set they were loaded from - sets are only a form-filling shortcut.
  gear_items: GearItemSummary[];
  notes: string;
  user_uuid: string;
  created_at: string;
  mixtures: DiveMixture[];
  // The dive-computer export this dive was imported from, if any.
  //
  // Optional because this same interface backs both the list and the detail
  // response, and the API deliberately only sends it on the detail one - the
  // list is the app's hottest query and nothing in it renders this. Don't
  // "fix" a missing value in the list by adding it server-side.
  source_file?: DiveFileInfo | null;
  // Set only when the dive records everything needed to derive it: exactly one
  // mixture, an average depth, and both of that mixture's pressures. Optional
  // for the same reason as `source_file` - it's a detail-response field, and it
  // additionally derives from `mixtures`, which the list response doesn't carry
  // either. Use `gasUseUnavailableReason()` (`lib/dive-gas.ts`) to explain a
  // missing value to the user rather than showing nothing.
  gas_use?: DiveGasUse | null;
}

// What the API accepts as a dive-computer export, mirrored here so the file
// picker can filter and so an obviously-oversized file is rejected before it
// is uploaded. The API re-checks both regardless - this is convenience, not
// validation.
export const DIVE_FILE_ACCEPT = ".xml,.json";
export const MAX_DIVE_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Metadata about the stored export a dive was imported from - never its bytes.
// The file itself is fetched separately (and authenticated) via
// `getDiveFileBlob`.
export interface DiveFileInfo {
  uuid: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  // Which parser read the file, e.g. "suunto_xml". Render it with
  // `diveParserLabel` rather than showing the raw key.
  parser_key: string;
  updated_at?: string | null;
}

const DIVE_PARSER_LABELS: Record<string, string> = {
  suunto_xml: "Suunto XML export",
  suunto_json: "Suunto JSON export",
};

// Human-readable name for a `parser_key`. Falls back to the raw key rather
// than to a blank or "Unknown": if the API grows a parser this build hasn't
// heard of, showing "garmin_fit" is worse than a label but far better than an
// empty cell that looks like a bug.
export function diveParserLabel(
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  return DIVE_PARSER_LABELS[key] ?? key;
}

export interface DiveCreate {
  user_uuid: string;
  dive_number: number;
  // Must be an offset-aware ISO 8601 string, e.g.
  // "2021-04-04T10:04:47.910+02:00" - see `Dive.start_time` above. Build one
  // with `combineStartTime()` from `lib/date-time.ts`.
  start_time: string;
  duration: number;
  max_depth?: number | null;
  avg_depth?: number | null;
  bottom_temperature?: number | null;
  visibility?: number | null;
  weight?: number | null;
  trip_uuid?: string;
  dive_site_uuids?: string[];
  gear_item_uuids?: string[];
  notes?: string;
  mixtures?: DiveMixture[];
}

export interface DiveUpdate {
  dive_number?: number;
  // Same offset-aware ISO 8601 format as `Dive.start_time`/`DiveCreate.start_time`.
  start_time?: string;
  duration?: number;
  max_depth?: number | null;
  avg_depth?: number | null;
  bottom_temperature?: number | null;
  visibility?: number | null;
  weight?: number | null;
  trip_uuid?: string;
  dive_site_uuids?: string[];
  gear_item_uuids?: string[];
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

// A gas mixture parsed from a dive-computer export file. Mirrors the API's
// `DiveMixtureSchema` - `name` is always `null` (mixture names aren't parsed,
// even when the source file has one - see DECISIONS.md - so the diver fills
// it in themselves), and `start_pressure`/`end_pressure` are nullable since
// not every gas in a file has recorded pressures (e.g. an untransmitted
// backup/deco cylinder).
export interface ParsedDiveMixture {
  name: string | null;
  volume: number;
  start_pressure: number | null;
  end_pressure: number | null;
  oxygen: number;
  helium: number;
}

// Result of parsing a dive-computer export file (e.g. Suunto XML or JSON) via /dive/parse.
// Most fields are nullable since not every dive-computer format populates every field.
export interface ParsedDive {
  dive_number: number | null;
  // The dive computer's raw exported timestamp - unlike `Dive.start_time`,
  // this may or may not carry an explicit UTC offset (e.g.
  // "2025-06-03T12:15:33.8" vs. "2021-04-04T10:04:47.910+02:00"), since not
  // every dive-computer format records one. See `applyParsedStartTime()` in
  // `dive-file-import.tsx` for how this is normalized before it ever reaches
  // the create/edit form.
  start_time: string | null;
  duration: number | null;
  max_depth: number | null;
  avg_depth: number | null;
  bottom_temperature: number | null;
  mixtures: ParsedDiveMixture[];
  // Proof that the API parsed this exact file for this user. Hand it back to
  // `uploadDiveFile` along with the same `File` once the dive exists, and the
  // export is stored against that dive. Nothing else can be attached: the API
  // re-hashes the body it receives and compares it against this token.
  file_token: string;
  [key: string]: unknown;
}

export const divesAPI = {
  // Create a new dive. `diveData.user_uuid` must be the currently signed-in user's uuid.
  async createDive(diveData: DiveCreate): Promise<Dive> {
    const response = await apiClient.post(`/dive`, diveData);
    return response.data;
  },

  // Get all dives for a user (paginated). Pass `tripUuid`/`diveSiteUuid`/
  // `gearItemUuid` to only return dives that belong to a given trip / were made
  // at a given site / used a given piece of gear.
  async getDives(
    userUuid: string,
    page: number = 1,
    items_per_page: number = 10,
    tripUuid?: string,
    diveSiteUuid?: string,
    gearItemUuid?: string,
  ): Promise<PaginatedDivesResponse> {
    const response = await apiClient.get(`/dives`, {
      params: {
        user_uuid: userUuid,
        page,
        items_per_page,
        ...(tripUuid !== undefined ? { trip_uuid: tripUuid } : {}),
        ...(diveSiteUuid !== undefined ? { dive_site_uuid: diveSiteUuid } : {}),
        ...(gearItemUuid !== undefined ? { gear_item_uuid: gearItemUuid } : {}),
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

  // Parse a dive-computer export file (e.g. Suunto XML or JSON) into structured dive data
  async parseDiveFile(file: File): Promise<ParsedDive> {
    const formData = new FormData();
    formData.append("file", file);

    // The apiClient instance has a fixed default "Content-Type: application/json" header.
    // For multipart uploads we must clear it so the browser can set the correct
    // "multipart/form-data; boundary=..." header itself.
    const response = await apiClient.post("/dive/parse", formData, {
      headers: { "Content-Type": undefined },
    });
    return response.data;
  },

  // Attach (or replace) the dive-computer export a dive was imported from.
  //
  // Called after the dive has been created or updated, not when the file is
  // picked: `/dive/parse` stores nothing, so a file only becomes worth keeping
  // once it has actually produced a dive.
  //
  // `fileToken` is the `file_token` from the `parseDiveFile` call for this same
  // file. Without it the API rejects the upload - it is what proves the bytes
  // are the ones that pre-filled the form rather than an arbitrary blob.
  //
  // The `Content-Type` header is explicitly cleared so the browser sets
  // `multipart/form-data` *with its own boundary* - same as `parseDiveFile`.
  async uploadDiveFile(
    diveUuid: string,
    file: File,
    fileToken: string,
  ): Promise<DiveFileInfo> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("file_token", fileToken);

    const response = await apiClient.put(`/dive/${diveUuid}/file`, formData, {
      headers: { "Content-Type": undefined },
    });
    return response.data;
  },

  async deleteDiveFile(diveUuid: string): Promise<void> {
    await apiClient.delete(`/dive/${diveUuid}/file`);
  },

  // Fetch a dive's stored export as a Blob.
  //
  // This has to go through the API client rather than a plain link: the file is
  // private, the endpoint requires an `Authorization` header, and an `<a href>`
  // cannot send one (the access token lives in memory, not in a cookie).
  //
  // `version` is sent as a `v` query param the API ignores. Its job is to give
  // each version of a file its own URL: the response is cached with
  // `max-age=300`, so without it the browser would keep serving the old bytes
  // for five minutes after a replace.
  async getDiveFileBlob(diveUuid: string, version?: string): Promise<Blob> {
    const response = await apiClient.get(`/dive/${diveUuid}/file`, {
      responseType: "blob",
      params: version ? { v: version } : undefined,
    });
    return response.data;
  },
};
