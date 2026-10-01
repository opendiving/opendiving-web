import { apiClient } from "./client";
import type { ExternalId } from "./dive-sites";
import type { GeoPoint } from "@/lib/geo-distance";
import { formatPlaceContext } from "@/lib/locations";

// The bounds `GET /dive-sites/suggest` declares on its own `q`. Mirrored rather
// than discovered, for the same reason `MIN_PLACE_QUERY_LENGTH` is: a query
// outside them is a 422, and a 422 is an exception - which the picker's error
// story ("an empty list is survivable, a thrown error is not") has no answer for.
//
// This guard is not inherited from anywhere. `PlaceSearch` hands its own
// `minSearchLength`/`maxSearchLength` to the combobox, but those feed the empty
// menu's wording only - the primitive's search effect calls `onSearch` with no
// length gate at all, including once with "" the moment the menu opens. Without
// the check below, every open of the dive site dialog would fire `q=`, take a
// 422, and land in the combobox's catch as "couldn't reach the place search"
// before the diver had typed a character.
export const MIN_SITE_QUERY_LENGTH = 2;
export const MAX_SITE_QUERY_LENGTH = 200;

/** Which database a suggestion came from. Each carries its own licence. */
export type DiveSiteSuggestionSource = "osm" | "wikidata";

/**
 * One named dive site from the catalog vendored in the API image.
 *
 * Not a resource: it has no uuid and no owner. Picking one makes an ordinary
 * per-user dive site from its values, and that site keeps `external_id` - the
 * record's registry entry - which is how a later search names it in `held_site`.
 *
 * `name` is what the site is called where it is, and is what the Name field is
 * filled from; `name_en` exists so a Latin keyboard reaches 砂辺 by typing
 * "Sunabe", and is null wherever the two would say the same thing.
 *
 * **`country` and `region` are genuinely nullable on real rows.** A few dozen
 * records sit far enough offshore that no administrative boundary is within
 * 50 km of them, and they ship anyway - a site with no country is still a site.
 * A caller that assumes otherwise writes "undefined" into the Location field.
 *
 * There is no country code and no distance here, both deliberately: an ISO code
 * has no business in a Location field whose own example is "Dahab, South Sinai,
 * Egypt", and the distance is computed here from `haversineMeters` so it can be
 * formatted in the diver's own units.
 */
export interface DiveSiteSuggestion {
  name: string;
  name_en?: string | null;
  latitude: number;
  longitude: number;
  // English display names, resolved when the catalog was built - neither
  // upstream carries them.
  country?: string | null;
  region?: string | null;
  source: DiveSiteSuggestionSource;
  // The stable identifier upstream, e.g. `node/255316037`. The catalogue's own
  // spelling of the same pair `external_id` carries, which a menu row is keyed on.
  source_id: string;
  // The record's registry entry in DiveJSON's spelling - `openstreetmap`, not
  // `osm` - which is what a pick sends back in the new site's `external_ids`.
  external_id: ExternalId;
  // The diver's own site already carrying that entry, the first by name where
  // several do, or `null`.
  held_site: { uuid: string; name: string } | null;
  // A licence condition of the data itself, so it travels with the row it
  // describes and survives a change of source. A wire format, `[label](href)`,
  // not display copy - render it through `Attribution`.
  attribution: string;
}

/**
 * A capped list, not a paginated envelope.
 *
 * `has_more` means the answer was cut by the endpoint's result cap, which is
 * what lets the menu say "keep typing to narrow" instead of letting a truncated
 * list read as everything there is.
 */
export interface DiveSiteSuggestResponse {
  results: DiveSiteSuggestion[];
  has_more: boolean;
}

/**
 * The read-only dive site catalog, which the place geocoder is not: a geocoder
 * knows where Dahab is, not where the Blue Hole's north entry is.
 *
 * Nothing here is owned by anybody. A pick prefills the ordinary site form, and
 * the dive site that results is the diver's own, carrying the record's registry
 * entry and nothing else of it.
 */
export const diveSiteCatalogAPI = {
  /**
   * Find named dive sites to prefill a new site from.
   *
   * Pass `position` when the form already has one and results come back nearest
   * first, which is the only thing that separates a same-name cluster - there
   * are five `Shark Point`s in four countries. Omit it and they are ranked by
   * how well the name matches. Half a pair cannot be expressed: the endpoint
   * answers 422 to one coordinate without the other, so this takes a whole
   * position or none.
   *
   * A query outside the endpoint's own `2..200` length is answered here without
   * a request, since asking would be a 422 - the one failure mode a picker
   * cannot treat as "no match".
   */
  async suggestDiveSites(
    query: string,
    position?: GeoPoint | null,
  ): Promise<DiveSiteSuggestResponse> {
    const q = query.trim();
    if (q.length < MIN_SITE_QUERY_LENGTH || q.length > MAX_SITE_QUERY_LENGTH) {
      return { results: [], has_more: false };
    }
    const response = await apiClient.get<DiveSiteSuggestResponse>(
      `/dive-sites/suggest`,
      {
        params: position
          ? { q, latitude: position.latitude, longitude: position.longitude }
          : { q },
      },
    );
    return response.data;
  },
};

/**
 * The place context a suggestion resolved to, as it belongs in a Location field:
 * `region, country` where the catalog has both, whichever one it has where it
 * has only one, and `null` where it resolved to neither.
 *
 * That `null` is the branch that matters. It means the catalog learned nothing
 * about where this site is, which is not the same as learning that it is
 * nowhere - so a caller must leave the Location field exactly as the diver left
 * it rather than emptying it.
 *
 * Never an ISO code: this string is written into an ordinary text input whose
 * placeholder reads "e.g. Dahab, South Sinai, Egypt".
 */
export function diveSitePlaceContext(site: DiveSiteSuggestion): string | null {
  return formatPlaceContext(site.region, site.country);
}
