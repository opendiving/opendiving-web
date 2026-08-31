import { API_BASE_URL } from "@/lib/api-base";
import { apiClient, PaginatedResponse } from "./client";

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
 *
 * `photo_sha256` is the *whole* photo contract - see `speciesPhotoUrl`. No URL
 * comes down the wire; the digest answers "is there a photo" and "which one" at
 * once, and the client composes the address itself.
 *
 * It is **optional, not merely nullable**, and the difference carries meaning.
 * `null` is the API saying this species has no photo; absent is this object not
 * being in a position to know. The picker constructs summaries out of
 * `SpeciesSearchResult`s, which carry no digest at all - a search feed includes
 * species not yet in the catalog, which by construction have no stored photo -
 * so writing `null` there would state something the row never said. Nothing
 * renders a photo from those summaries, which is why the picker has no
 * thumbnails.
 */
export interface SpeciesSummary {
  uuid: string;
  scientific_name: string;
  common_name: string | null;
  rank: string;
  photo_sha256?: string | null;
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
  // The Wikidata entity behind the common name, when one was found, and the
  // entity the stored photo was found through: the API reads P18 off it.
  wikidata_qid: string | null;
  created_at: string;
  // The stored photo's provenance, as the parts a compliant credit is built
  // from rather than one ready-made string - which is the opposite of what
  // `SpeciesSearchResult.attribution` does, and deliberately so: a credit here
  // needs *two* hyperlinks, the licence and the source page, and one string can
  // carry at most one of them. `SpeciesPhotoCredit` composes them; nothing here
  // is markup, and none of it may be interpolated as HTML.
  //
  // Every field is independently null. A photo whose author Commons did not
  // record is a real state, not a defensive one.
  photo_file: string | null;
  photo_author: string | null;
  photo_license: string | null;
  photo_license_url: string | null;
  photo_source_url: string | null;
}

/**
 * One row of the life list at `GET /user/species` - a species this diver has
 * logged, and their whole history with it.
 *
 * Not a `Species` with extras: `dive_count`, `first_seen` and `last_seen` are
 * facts about *this caller's* logbook rather than about the taxon, which is why
 * the route hangs off `/user/` and not off the ownerless `/species/`. The taxon
 * half is the same subset `SpeciesSummary` carries, so a card renders without a
 * second request per row.
 *
 * **`first_seen` and `last_seen` are dive start times, so they carry the offset
 * of the dive behind each end of the range - not UTC.** That is the app-wide
 * contract every dive-derived surface honours, and it means they are formatted
 * with `formatDiveDateTime`, never with `formatDateTime`. Re-deriving a local
 * time from either would report the viewer's clock for a dive logged in
 * Thailand; the error is invisible against any dive logged at `+00:00`.
 */
export interface SpeciesLifeListEntry {
  uuid: string;
  scientific_name: string;
  common_name: string | null;
  rank: string;
  photo_sha256: string | null;
  dive_count: number;
  first_seen: string;
  last_seen: string;
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
 * the displayed name, or anything else visible on the row. Unlike `common_name`
 * it is not English-only: it reports the name the match happened on, in whatever
 * language that was, since a foreign word is what explains a row a foreign word
 * found.
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

// How much of the digest goes in the cache-busting query. Enough that no two
// stored photos collide in practice, short enough not to put 64 characters in
// every `src` on a page of fifty. The value is opaque to the API - it serves
// whatever photo the uuid names and ignores `v` entirely - so this is purely
// about giving a replaced photo a URL the browser has not cached.
const PHOTO_VERSION_LENGTH = 12;

/**
 * Where to point an `<img>` at a species' photo, or `null` when it has none.
 *
 * **Composed here rather than sent by the API**, following the avatar precedent:
 * one nullable digest on the wire answers existence, version and cache-busting
 * at once. Pass the `photo_sha256` off whatever carries it - a dive's embedded
 * species, a life-list row, the catalog record - and render nothing at all when
 * this returns `null`.
 *
 * Unlike an avatar this is a plain `<img src>` rather than an authenticated blob
 * fetch (`hooks/useAuthedBlobUrl.ts`): the route is deliberately unauthenticated,
 * because an `<img>` cannot carry the in-memory bearer token and the blob path
 * re-fetches on every mount - which a life list of fifty thumbnails is exactly
 * the wrong shape for. The bytes disclose nothing: the catalog is global and
 * ownerless, and they are Commons files anyone can fetch from Commons.
 *
 * **Built against `API_BASE_URL`, never a literal `/api/v1`.** A hard-coded path
 * resolves against the page's own origin, which is right in the shipped
 * same-origin topology and wrong in a split-origin build - including local dev,
 * where the photo must go to `:8000` and not to `:3000`. That failure is silent:
 * the image simply does not load, and only the network panel says why.
 */
export function speciesPhotoUrl(
  uuid: string,
  photoSha256: string | null | undefined,
): string | null {
  if (!photoSha256) return null;
  const version = photoSha256.slice(0, PHOTO_VERSION_LENGTH);
  return `${API_BASE_URL}/species/${encodeURIComponent(uuid)}/photo?v=${encodeURIComponent(version)}`;
}

/**
 * The global species catalog, and the live WoRMS + Wikidata search in front of
 * it - all proxied by the API, so no third-party host needs a `connect-src`
 * entry and the providers see one identified client rather than every browser.
 * The stored photos are served the same way, from this instance's own API: the
 * browser never contacts Wikimedia, so `img-src` names no third party either.
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
  // Also what the species page reads, since it renders the classification and
  // the photo credit that only this schema carries.
  async getSpecies(uuid: string): Promise<Species> {
    const response = await apiClient.get<Species>(`/species/${uuid}`);
    return response.data;
  },

  /**
   * The signed-in diver's life list: every species they have ever logged, most
   * recently seen first.
   *
   * Always the caller's own account - the route takes no uuid, like the rest of
   * `/user/...`, so there is no ownership argument to get backwards. `search`
   * matches any name the species goes by, the same way the catalog search does.
   *
   * Counts live dives only, so `total_count` equals the `species_seen` on
   * `getDiveStats()` for the same account, and soft-deleting the only dive that
   * recorded a species drops it from both.
   */
  async getLifeList(
    page: number = 1,
    items_per_page: number = 10,
    search?: string,
  ): Promise<PaginatedResponse<SpeciesLifeListEntry>> {
    const response = await apiClient.get<
      PaginatedResponse<SpeciesLifeListEntry>
    >(`/user/species`, {
      params: {
        page,
        items_per_page,
        ...(search ? { search } : {}),
      },
    });
    return response.data;
  },
};
