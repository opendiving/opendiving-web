import { apiClient, lookupParams } from "./client";
import type { LookupQuery, PaginatedResponse } from "./client";
import type { EntryType, WaterType } from "./dives";
import type { Location } from "./location";

/**
 * The site's entry in a registry outside the logbook - DiveJSON's External Id. The
 * format names `wikidata` and `openstreetmap` and holds their identifiers to a
 * form; any other registry is carried as written. Two sites may share one, so it is
 * evidence that two records are one place, never a key.
 */
export interface ExternalId {
  registry: string;
  identifier: string;
}

/**
 * What the diver's own live dives say of a site, counted by the API at read time
 * over every dive naming the site at any position - so the second site of a drift
 * dive counts that dive too. Never stale: every write that moves a figure drops the
 * cached read.
 */
export interface DiveSiteDiveSummary {
  dive_count: number;
  /** The latest dive's own local date, `YYYY-MM-DD`. */
  last_dived_on: string | null;
  /** The greatest `max_depth` among them, in metres. */
  max_dive_depth: number | null;
  species_count: number;
  /** The mean of the rated ones, 1 to 5. */
  average_rating: number | null;
}

// A site carries two positions that mean different things: `latitude`/
// `longitude` are the pin a diver dropped, and `location.latitude`/
// `location.longitude` are the centre of the town the geocoder resolved.
// Nothing fills either from the other.
//
// `latitude`/`longitude` are both-or-neither on the API, and the rule is about
// the request body rather than the resulting row: naming one without the other
// is a 422, so is naming both with only one value, and the stored row is never
// consulted. Sending both as `null` is how a position is cleared, and moving a
// site means sending both numbers even when only one changed.
// `lib/validations/dive-site.ts` enforces the same rule in the form.
//
// `water_type`, `altitude` and `entry_types` are the *place's*, where a dive's are
// what was recorded that day; neither is filled from the other, and the new-dive
// form offering a site's is the app's behaviour, not the format's. The two
// vocabularies are read as strings, a value the web does not know being read as
// absent. The members and the summary are optional here only because a site
// assembled in the web from an older shape lacks them; every read carries them.
export interface DiveSite extends Partial<DiveSiteDiveSummary> {
  uuid: string;
  name: string;
  /** Other names the site goes by, in the diver's order. */
  other_names?: string[];
  location?: Location | null;
  latitude?: number | null;
  longitude?: number | null;
  external_ids?: ExternalId[];
  /** Metres: the shallowest and the deepest depth dived there. */
  depth_from?: number | null;
  depth_to?: number | null;
  water_type?: string | null;
  /** Whole metres above sea level. */
  altitude?: number | null;
  /** Every way divers get in there, in the vocabulary's order. */
  entry_types?: string[];
  /** By name, in the diver's order. */
  tags?: string[];
  notes?: string;
  user_uuid: string;
  created_at: string;
}

// The members a site write sets beside its name and place. Lists replace the
// stored list whole, and the API makes them conforming rather than refusing them:
// another name the name already says, a repeated registry entry or entry type is
// kept once. Tags are by name, created where the diver has none of that name.
interface DiveSiteMembersWrite {
  other_names?: string[];
  external_ids?: ExternalId[];
  depth_from?: number | null;
  depth_to?: number | null;
  water_type?: WaterType | null;
  altitude?: number | null;
  entry_types?: EntryType[];
  tags?: string[];
}

export interface DiveSiteCreate extends DiveSiteMembersWrite {
  name: string;
  location?: Location | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string;
}

// The `PATCH /dive-site/{uuid}` body, which is the API's nested
// `DiveSiteUpdateRequest` rather than the flat `DiveSiteUpdate` beside it -
// that one is the admin panel's form and is swept against the table's columns,
// so it spells the locality as eight `location_*` fields and cannot nest.
//
// Naming `location` **replaces** the stored place wholesale: it is a value
// object with nothing to merge into, and a partial update would leave a cleared
// locality's centre and box behind. An explicit `null` clears it, which is how
// a site entered with the wrong place is corrected back to "not recorded".
//
// A member left out is left as it is. `null` clears a depth, the water type and
// the altitude, and is refused on the three lists, where `[]` is the clear.
export interface DiveSiteUpdate extends DiveSiteMembersWrite {
  name?: string;
  location?: Location | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string;
}

/**
 * The sites list's three orders, the API's `DiveSiteListSort`: by name, the
 * default; most dived first; most recently dived first. The two summary orders put
 * every site no live dive names last, and break ties by name.
 */
export const DIVE_SITE_LIST_SORTS = [
  "name",
  "dive_count",
  "last_dived_on",
] as const;
export type DiveSiteListSort = (typeof DIVE_SITE_LIST_SORTS)[number];

/** What narrows the sites list, and its order. */
export interface DiveSiteFilters {
  /** Matched against the name, the other names and the locality's name. */
  search?: string;
  /** Only the sites carrying this tag; one not the caller's answers an empty page. */
  tagUuid?: string;
  /** `name` when not given. */
  sort?: DiveSiteListSort;
}

export type PaginatedDiveSitesResponse = PaginatedResponse<DiveSite>;

/** One row of `GET /dive-sites/lookup`: the name and the locality a picker shows under it. */
export interface DiveSiteLookupItem {
  uuid: string;
  name: string;
  location?: Location | null;
}

/**
 * Dive-site CRUD. `getDiveSites` and `lookupDiveSites` take a `search` the API matches
 * server-side against the site's name, its other names and its locality's name, which is
 * what lets the pickers narrow as you type instead of loading a diver's whole site list.
 */
export const diveSitesAPI = {
  // Create a new dive site, owned by the signed-in user.
  async createDiveSite(data: DiveSiteCreate): Promise<DiveSite> {
    const response = await apiClient.post(`/dive-site`, data);
    return response.data;
  },

  // Get a page of the user's dive sites, each with its summary. The API caps
  // `items_per_page` at 100, so a search is a page of matches, never the whole
  // set. A filter or the default order is left off the request rather than sent.
  async getDiveSites(
    page: number = 1,
    items_per_page: number = 10,
    { search, tagUuid, sort }: DiveSiteFilters = {},
  ): Promise<PaginatedDiveSitesResponse> {
    const response = await apiClient.get(`/dive-sites`, {
      params: {
        page,
        items_per_page,
        ...(search ? { search } : {}),
        ...(tagUuid ? { tag_uuid: tagUuid } : {}),
        ...(sort && sort !== "name" ? { sort } : {}),
      },
    });
    return response.data;
  },

  /**
   * A page of the diver's sites as a picker lists them, the site last dived at on
   * or before `until` first, then never-dived sites newest first. `search` matches
   * what `getDiveSites` matches.
   */
  async lookupDiveSites(
    page: number,
    items_per_page: number,
    query: LookupQuery = {},
  ): Promise<PaginatedResponse<DiveSiteLookupItem>> {
    const response = await apiClient.get(`/dive-sites/lookup`, {
      params: lookupParams(page, items_per_page, query),
    });
    return response.data;
  },

  // Get a specific dive site by uuid
  async getDiveSite(diveSiteUuid: string): Promise<DiveSite> {
    const response = await apiClient.get(`/dive-site/${diveSiteUuid}`);
    return response.data;
  },

  // Update a dive site
  async updateDiveSite(
    diveSiteUuid: string,
    updateData: DiveSiteUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(
      `/dive-site/${diveSiteUuid}`,
      updateData,
    );
    return response.data;
  },

  /**
   * Delete a dive site, optionally moving the dives logged at it to another one
   * first.
   *
   * `moveDivesTo` swaps this site for that one across every live dive logged
   * here and deletes it **in one transaction**. The replacement takes this
   * site's place in each dive's ordered list - inheriting primary-site position
   * where this one held it - and a dive already logged at both ends up holding
   * the replacement once.
   *
   * Idempotent, with the same retry caveat as `deleteTrip`: a repeat call after
   * a lost response succeeds, because there is nothing left to move.
   *
   * A `moveDivesTo` that isn't one of the diver's own live sites, or that is
   * this site, is a 422.
   */
  async deleteDiveSite(
    diveSiteUuid: string,
    moveDivesTo?: string,
  ): Promise<{ message: string }> {
    const response = await apiClient.delete(`/dive-site/${diveSiteUuid}`, {
      params: moveDivesTo ? { move_dives_to: moveDivesTo } : undefined,
    });
    return response.data;
  },
};
