import { apiClient } from "./client";

// The bounds `GET /species/search` declares on its own `q`. Mirrored rather than
// discovered, for the same reason `MIN_PLACE_QUERY_LENGTH` is: a query outside
// them is a 422, and a 422 is an exception - which the picker's error story
// ("an empty list is survivable, a thrown error is not") has no answer for.
//
// Both are exported because a field that searches has to say something while the
// query is outside them, and "no species found" is not it: nothing was looked for.
export const MIN_SPECIES_QUERY_LENGTH = 2;
export const MAX_SPECIES_QUERY_LENGTH = 255;

/**
 * A species as it rides on a dive - just enough to render a row.
 *
 * `common_name` is a single English display name and is genuinely often absent:
 * most of the ocean has no English common name, and the display falls back to
 * the scientific name. `rank` is WoRMS's open vocabulary ("Species", "Genus",
 * "Family", ...) rather than a closed enum, so it is a plain string - a
 * genus- or family-level sighting ("a moray eel") is a legitimate log entry.
 */
export interface SpeciesSummary {
  uuid: string;
  scientific_name: string;
  common_name: string | null;
  rank: string;
}

/**
 * The whole catalog record, from `GET /species/{uuid}` and the resolve response.
 *
 * `aphia_id` is the canonical identity - a WoRMS AphiaID, always pointing at an
 * *accepted* taxon: resolving a synonym ("Manta birostris") persists the
 * accepted one (*Mobula birostris*), so two divers who typed different names for
 * the same animal end up on the same row.
 *
 * `class_name`/`order_name` are named for the API's columns, which dodge the
 * Python and SQL keywords rather than expressing anything about taxonomy.
 */
export interface Species extends SpeciesSummary {
  aphia_id: number;
  authority: string | null;
  status: string;
  kingdom: string | null;
  phylum: string | null;
  class_name: string | null;
  order_name: string | null;
  family: string | null;
  genus: string | null;
  // WoRMS habitat flags, free at resolve time. Nothing renders them yet; they
  // are here because the wire carries them and a type that silently drops
  // fields is the sort that goes stale.
  is_marine: boolean | null;
  is_brackish: boolean | null;
  is_freshwater: boolean | null;
  // The Wikidata entity behind the common name, when one was found. Stored for
  // the photos iteration, which starts from P18 on this entity.
  wikidata_qid: string | null;
  created_at: string;
}

/**
 * One row of the picker's feed, merged by the API from the local catalog, WoRMS
 * and Wikidata.
 *
 * `uuid` is the fork in the road: set means the species is already a catalog row
 * and can be added to a dive as-is; `null` means it exists only upstream and has
 * to go through `resolveSpecies` first. `aphia_id` is what identifies it either
 * way, and is what `resolveSpecies` takes.
 *
 * `matched_name` says *why* this row came back when that isn't obvious from the
 * names shown - the synonym or vernacular that matched. Null when the query hit
 * the displayed name.
 *
 * `attribution` rides on each result rather than in an envelope because it is a
 * licence condition of the data itself, and it must be rendered wherever the
 * result is shown - the same contract `GeocodeResult.attribution` carries.
 */
export interface SpeciesSearchResult {
  aphia_id: number;
  uuid: string | null;
  scientific_name: string;
  common_name: string | null;
  rank: string;
  status: string;
  matched_name: string | null;
  source: "catalog" | "worms" | "wikidata";
  attribution: string;
}

/**
 * A capped page of picker results.
 *
 * A plain list rather than the paginated envelope the app's collections use:
 * this is a picker feed like `GET /geocode/search`, capped at 25, and `has_more`
 * only exists so the menu can say "keep typing to narrow" instead of letting a
 * truncated list read as "that's everything".
 */
export interface SpeciesSearchResponse {
  results: SpeciesSearchResult[];
  has_more: boolean;
}

/**
 * The global species catalog, and the live WoRMS + Wikidata search in front of
 * it - all proxied by the API, so no third-party host needs a `connect-src`
 * entry and the providers see one identified client rather than every browser.
 *
 * Unlike every other module here, these records belong to nobody: a species is a
 * fact about the ocean, so the endpoints require auth but have no owner to
 * check, and two divers who log the same fish share the row.
 */
export const speciesAPI = {
  /**
   * Find species by common name, scientific name, synonym or alias.
   *
   * A query outside the endpoint's own `2..255` length is answered here without
   * a request, since asking would be a 422 - which is a *rejection*, and so the
   * one failure mode this function's callers can't treat as "no match". A
   * combobox probes with `""` the moment its menu opens, which is what makes
   * this guard load-bearing rather than defensive.
   *
   * Everything else the API already degrades: a provider being down, throttled
   * or slow returns whatever the other sources found, so an empty `results` here
   * means "nothing matched" *or* "nothing was reachable", and callers that can't
   * act on the difference shouldn't try. Only a thrown error - the per-user 429,
   * a network failure - is exceptional.
   */
  async searchSpecies(query: string): Promise<SpeciesSearchResponse> {
    const q = query.trim();
    if (
      q.length < MIN_SPECIES_QUERY_LENGTH ||
      q.length > MAX_SPECIES_QUERY_LENGTH
    ) {
      return { results: [], has_more: false };
    }
    const response = await apiClient.get<SpeciesSearchResponse>(
      `/species/search`,
      { params: { q } },
    );
    return response.data;
  },

  /**
   * Turn an upstream AphiaID into a catalog row, creating it on first sight.
   *
   * Idempotent, and a 200 either way - "resolve", not "create": the second diver
   * to pick a clownfish gets the row the first one made. Two divers resolving
   * the same new species concurrently also both get it; the API settles the race
   * on its unique `aphia_id`.
   *
   * This is the one call in the picker that can genuinely fail rather than
   * degrade: the API will not invent a catalog row without the authoritative
   * record, so an unreachable WoRMS is a 503 rather than a guess.
   */
  async resolveSpecies(aphiaId: number): Promise<Species> {
    const response = await apiClient.post<Species>(`/species/resolve`, {
      aphia_id: aphiaId,
    });
    return response.data;
  },

  // Fetch one catalog row by uuid. The picker's safety net for labelling a
  // selection it has nothing else to go on - a dive being edited hands its
  // species over directly, so this is a per-uuid fallback, not the usual path.
  async getSpecies(uuid: string): Promise<Species> {
    const response = await apiClient.get<Species>(`/species/${uuid}`);
    return response.data;
  },
};
