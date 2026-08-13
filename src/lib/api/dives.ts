import { apiClient } from "./client";
import type { PaginatedResponse } from "./client";
import { GearItemSummary } from "./gear";

// A single gas mixture / scuba tank used during a dive.
// The ppO₂ vocabulary and the cylinder-role vocabulary the API accepts. Mirrors
// `GasRole` (`schemas/dive_mixture.py`), which is the single source of truth - the API
// rejects anything outside it, so this list has to be kept in step by hand.
export const GAS_ROLES = ["bottom", "deco", "diluent", "oxygen"] as const;
export type GasRole = (typeof GAS_ROLES)[number];

// Every optional field is `| null` because that is what comes back on the wire, not
// merely what could be missing: the API declares them `X | None` (`DiveMixtureBase`
// in `schemas/dive_mixture.py`) and sets no `exclude_none`, so an unrecorded field
// arrives as an explicit `null` rather than an absent key. Writing them `?: number`
// alone made TypeScript vouch for a value the response never promised, and the form
// pages - which feed these straight into `diveMixtureSchema`, where `null` is not a
// member of any field's union - were the ones that paid for it.
export interface DiveMixture {
  id?: number;
  name?: string | null;
  volume: number;
  start_pressure?: number | null;
  end_pressure?: number | null;
  oxygen: number;
  helium: number;
  // The ppO₂ this gas was planned to, in bar - the limit its MOD is derived from.
  // Imported from the dive computer where the export records one, and editable.
  // Null/undefined falls back to `PPO2_WORKING` at every call site computing a MOD.
  po2_limit?: number | null;
  // How the source export identifies this cylinder, and the join key to the profile's
  // per-cylinder pressure channels. **A label, not an index** - a Suunto Ocean numbers
  // its cylinders from 0 while the other parsers count from 1 (see the API's
  // DECISIONS.md). Carried through edits rather than edited: the form round-trips it
  // untouched so an import's numbering survives a save, and a hand-added cylinder has
  // none.
  gas_number?: number | null;
  // What the cylinder was carried for. Rarely present on an import - most exports
  // don't record it - so this is mostly the diver's own label.
  role?: GasRole | null;
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
  // Oxygen exposure and surface pressure as the dive computer recorded them, written
  // by the import and **not settable through the form** - the API keeps these off its
  // create/update schemas entirely (see its DECISIONS.md), because nothing on a logged
  // dive reconstructs a CNS clock or an OTU count. Undefined on a hand-logged dive, on
  // one imported from a format that doesn't record them (every FIT file has no surface
  // pressure; a 2026 Suunto Ocean export has none of them), and on any dive imported
  // before the backfill ran.
  //
  // Unlike `gas_use`/`profile`/`source_file` below, these are on the list response too:
  // those are kept off it because each costs the hottest query an extra lookup, and
  // these are plain columns on the row being selected anyway.
  //
  // `| null` for the same reason as `DiveMixture`'s optional fields, and it is the same
  // schema decision behind it: `DiveTechScalars` declares all five `float | None` with
  // no `exclude_none`, so an unrecorded reading arrives as an explicit `null`, not an
  // absent key. `DiveExposureCard` guards with `!= null` and would survive either way -
  // but a type that promises `number | undefined` over a response that sends `null` is
  // exactly what let three mixture fields reach a resolver unconverted.
  cns_start?: number | null;
  cns_end?: number | null;
  otu_start?: number | null;
  otu_end?: number | null;
  // Ambient pressure at the surface, in bar. Display only - the API's gas-use maths
  // deliberately assumes 1 bar.
  surface_pressure_bar?: number | null;
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
  // Summary of the dive's per-sample profile, if one was extracted from its
  // imported file. Optional for the same reason as `source_file` above: the API
  // deliberately only sends it on the detail response. The curves themselves are
  // tens of KB and are fetched separately via `getDiveProfile`.
  profile?: DiveProfileInfo | null;
}

// What the dive detail response says about a dive's profile without carrying it:
// enough to decide whether to render the card, what to put in its heading, and
// which version of the series to ask for.
export interface DiveProfileInfo {
  uuid: string;
  // Span of the recorded samples, which is *not* `dive.duration` - a dive
  // computer keeps logging for a few seconds after the dive ends, and
  // `dive.duration` is the diver's own record and may have been hand-edited.
  duration_seconds: number;
  depth_sample_count: number;
  // Which curves the profile carries: any of "depth", "temperature", "pressure".
  channels: string[];
  // Display units (meters, Celsius, bar) - unlike the series, which stay
  // integer-scaled. These are scalars a human reads, not points to map.
  max_depth?: number | null;
  min_temperature?: number | null;
  max_temperature?: number | null;
  min_pressure?: number | null;
  max_pressure?: number | null;
  updated_at?: string | null;
}

// One channel of a profile, exactly as the API stores it: `t` is elapsed seconds
// from the start of the dive, `v` is integer-scaled (see `PROFILE_CHANNELS` in
// `lib/dive-profile.ts` for the divisor per channel).
//
// Integers rather than floats deliberately, both on the wire and in the
// database: a float round-trip reintroduces `20.600000000000023`-class noise
// several thousand times per dive, and the chart is going to map every point
// through a scale function anyway - so it divides once per point there.
//
// There are no nulls inside a series. A sensor dropout is a *gap in `t`*, which
// `segmentByTimeGap` turns into separate polylines.
export interface DiveProfileSeries {
  t: number[];
  v: number[];
}

export interface DiveProfilePressureSeries extends DiveProfileSeries {
  // Which cylinder this curve belongs to: the device's own gas number where the
  // export carries one (1 on a 2025 D5, 0 on a Suunto Ocean), otherwise the
  // cylinder's 1-based position in the file (FIT, which identifies a tank only
  // by its transmitter's ANT serial - useless in a legend). A label to display,
  // never an index to trust.
  gas_number: number;
}

export interface DiveProfile {
  duration_seconds: number;
  depth?: DiveProfileSeries | null;
  temperature?: DiveProfileSeries | null;
  pressure: DiveProfilePressureSeries[];
}

/**
 * What the API accepts as a dive-computer export, mirrored here so the file
 * picker can filter and so an obviously-oversized file is rejected before it
 * is uploaded. The API re-checks both regardless - this is convenience, not
 * validation.
 */
export const DIVE_FILE_ACCEPT = ".xml,.json,.fit";
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

/**
 * Human-readable label per API parser key (`DiveParser.key` in the API's
 * `dive_parsers` registry).
 *
 * Exported so `DIVE_FILE_ACCEPT` can be pinned against it in `dives.test.ts` via
 * `satisfies Record<keyof typeof DIVE_PARSER_LABELS, string>` — adding a parser
 * here without offering its extension stops the test compiling, rather than
 * silently greying the file out in the picker.
 *
 * Not "Garmin FIT": one API parser reads the FIT files of every vendor that
 * writes them, so naming a single manufacturer would mislabel the other one's
 * dives.
 */
export const DIVE_PARSER_LABELS = {
  suunto_xml: "Suunto XML export",
  suunto_json: "Suunto JSON export",
  fit: "FIT export",
};

/**
 * Human-readable name for a `parser_key`. Falls back to the raw key rather
 * than to a blank or "Unknown": if the API grows a parser this build hasn't
 * heard of, showing "garmin_fit" is worse than a label but far better than an
 * empty cell that looks like a bug.
 */
export function diveParserLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  // Widened at the lookup rather than on the declaration, so the map keeps its
  // literal key type for the accept-list test while still accepting a parser
  // key this build has never heard of.
  const labels: Record<string, string> = DIVE_PARSER_LABELS;
  return labels[key] ?? key;
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
  // `null` detaches the dive from its trip; omitting the field leaves whatever
  // trip it already has alone. Same "explicit null clears, absent means no
  // change" contract as the nullable measurements above - and the reason
  // `TripCombobox` normalizes its cleared value to `null` rather than
  // `undefined`, which the update payload builder drops from the request.
  trip_uuid?: string | null;
  dive_site_uuids?: string[];
  gear_item_uuids?: string[];
  notes?: string;
  mixtures?: DiveMixture[];
}

// What to prefill a new dive's number with, from `/dives/next-number`.
//
// Derived by the API from the dive's *date*, not from the newest dive in the
// log: back-filling a 2019 dive into a log that already reaches #212 should
// suggest #12, not #213. See the API's `services/dive_numbering.py`.
export interface DiveNumberSuggestion {
  dive_number: number;
  // Whether an existing dive already carries this number. Advisory only - show
  // it, don't block on it. Back-filling a run of old dives collides by
  // construction, and `renumberDives` is what reconciles the log afterwards.
  is_taken: boolean;
}

// The state of a user's dive numbering, from `/dives/numbering`.
//
// Reported, never enforced. A gap means "part of my log lives in a paper
// logbook" as often as it means "my numbering is a mess", and only the diver
// knows which - so this drives an indicator they can ignore, not a warning.
export interface DiveNumberingSummary {
  total_dives: number;
  // Null only when the log is empty.
  lowest: number | null;
  highest: number | null;
  // How many numbers between `lowest` and `highest` no dive uses.
  missing_count: number;
  // How many dives carry a number another dive also carries.
  duplicate_count: number;
  // How many dives are numbered lower than the dive chronologically before them.
  out_of_date_order_count: number;
  // One unbroken run, no duplicates. Doesn't require starting at 1: a log
  // running #47-#212 is exactly as tidy as one running #1-#166.
  is_sequential: boolean;
}

export interface DiveRenumberRequest {
  // The number to give the earliest dive in scope.
  start_at?: number;
  // Offset-aware ISO 8601. Renumber only dives at or after this instant,
  // leaving earlier ones alone - so a log whose older entries mirror a paper
  // logbook can have just its recent tail tidied. Omit to renumber everything.
  from_start_time?: string;
  // Compute the changes and write nothing. Always send `true` first: it's what
  // the confirmation dialog renders.
  dry_run?: boolean;
}

export interface DiveRenumberChange {
  dive_uuid: string;
  start_time: string;
  dive_number: number;
  new_dive_number: number;
}

export interface DiveRenumberResult {
  dry_run: boolean;
  dives_in_scope: number;
  // Only the dives whose number actually moves, in chronological order - a log
  // already numbered as requested comes back with this empty.
  changes: DiveRenumberChange[];
}

export type PaginatedDivesResponse = PaginatedResponse<Dive>;

// A gas mixture as read out of a dive-computer export, mirroring the API's
// `DiveMixtureSchema`. Every field is nullable and `null` means "the file didn't
// record this" - the API's parsers report what they read and never substitute a
// plausible value. `name` is always `null`: mixture names aren't parsed even
// when the source file has one (see DECISIONS.md), so the diver names them.
//
// Fill the gaps with `DEFAULT_MIXTURE` (`components/dives/mixture-fields.tsx`),
// which is what the form shows for a cylinder added by hand - and say so, via
// `describeMixtureImport`. A guessed cylinder size feeds `gas_use`, so a diver
// who cannot tell it from a reading gets an RMV presented as a derived fact.
export interface ParsedDiveMixture {
  name: string | null;
  volume: number | null;
  start_pressure: number | null;
  end_pressure: number | null;
  oxygen: number | null;
  helium: number | null;
  // All nullable like everything else here, and for the same reason: a parser reports
  // what the file recorded. Only the two Suunto exports carry a ppO₂ at all, and only
  // the JSON one carries anything role-shaped.
  po2_limit: number | null;
  gas_number: number | null;
  role: GasRole | null;
}

// Result of parsing a dive-computer export file (Suunto XML or JSON, or a FIT file) via /dive/parse.
// Most fields are nullable since not every dive-computer format populates every field.
export interface ParsedDive {
  dive_number: number | null;
  // The dive computer's raw exported timestamp - unlike `Dive.start_time`,
  // this may or may not carry an explicit UTC offset (e.g.
  // "2025-06-03T12:15:33.8" vs. "2021-04-04T10:04:47.910+02:00"), since not
  // every dive-computer format records one. See `normalizeParsedStartTime()`
  // in `lib/date-time.ts` for how this is normalized before it ever reaches
  // the create/edit form.
  start_time: string | null;
  duration: number | null;
  max_depth: number | null;
  avg_depth: number | null;
  bottom_temperature: number | null;
  mixtures: ParsedDiveMixture[];
  // Returned by the parse so a preview can show them, but deliberately **not** applied
  // to the form: the API writes these itself when the file is attached, from its own
  // re-parse of the same bytes. Nothing here should try to send them back.
  cns_start: number | null;
  cns_end: number | null;
  otu_start: number | null;
  otu_end: number | null;
  surface_pressure_bar: number | null;
  // Proof that the API parsed this exact file for this user. Hand it back to
  // `uploadDiveFile` along with the same `File` once the dive exists, and the
  // export is stored against that dive. Nothing else can be attached: the API
  // re-hashes the body it receives and compares it against this token.
  file_token: string;
  [key: string]: unknown;
}

/**
 * Dive CRUD, plus dive-computer file import, profile fetching and numbering.
 *
 * Two things differ from the other resources here. Updates replace the list-valued fields
 * (`mixtures`, `dive_site_uuids`, `gear_item_uuids`) wholesale rather than merging, so a
 * caller must send the full intended list. And importing a file is two steps - parse to
 * pre-fill the form, then upload against the created dive - because the diver gets to
 * correct the parsed values before anything is stored.
 */
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

  // The dive number to prefill for a dive starting at `startTime` (offset-aware
  // ISO 8601 - build one with `combineStartTime()` from `lib/date-time.ts`).
  //
  // A suggestion, not a reservation. Always the signed-in user's own log, so
  // unlike `getDives` this takes no user uuid.
  async getNextDiveNumber(startTime: string): Promise<DiveNumberSuggestion> {
    const response = await apiClient.get(`/dives/next-number`, {
      params: { start_time: startTime },
    });
    return response.data;
  },

  // The state of the signed-in user's dive numbering, for the log's numbering
  // indicator.
  async getDiveNumbering(): Promise<DiveNumberingSummary> {
    const response = await apiClient.get(`/dives/numbering`);
    return response.data;
  },

  // Renumber the signed-in user's dives consecutively, in date order.
  //
  // The one call in the app that rewrites numbers the diver entered. Call it
  // with `dry_run: true` first and show the result before calling it for real -
  // some of those numbers may also be written in a paper logbook.
  async renumberDives(
    request: DiveRenumberRequest = {},
  ): Promise<DiveRenumberResult> {
    const response = await apiClient.post(`/dives/renumber`, request);
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

  // Parse a dive-computer export file (Suunto XML or JSON, or a FIT file) into structured dive data
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

  // Fetch a dive's per-sample profile. 404s when the dive has no imported file,
  // or has one that carried no samples - check `dive.profile` first rather than
  // calling this speculatively.
  //
  // `version` is sent as a `v` query param the API ignores, for the same reason
  // as `getDiveFileBlob`: the response is `max-age=300`, and a re-extraction
  // (after an extractor-version bump, say) would otherwise be masked by the
  // previous payload for five minutes. Pass the profile's `updated_at`.
  async getDiveProfile(
    diveUuid: string,
    version?: string,
  ): Promise<DiveProfile> {
    const response = await apiClient.get(`/dive/${diveUuid}/profile`, {
      params: version ? { v: version } : undefined,
    });
    return response.data;
  },
};
