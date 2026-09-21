import { apiClient } from "./client";

// The bounds `GET /geocode/search` declares on its own `q`. Mirrored rather than
// discovered, because a query outside them is a 422 and a 422 is an exception,
// and the place picker's whole error story is "an empty list is survivable, a
// thrown error is not".
//
// Both are exported because a field that searches has to say something while the
// query is outside them, and "no places found" is not it: nothing was looked for.
export const MIN_PLACE_QUERY_LENGTH = 2;
export const MAX_PLACE_QUERY_LENGTH = 200;

/**
 * One place, normalized by the API away from whichever provider answered.
 *
 * `location` and `display_name` answer different questions. `location` is the
 * short, composed form that becomes a place's `name` - divers write "Dahab,
 * Egypt", not a seven-part postal address. `display_name` is the provider's
 * full label, which is what tells two similar results apart in a menu and what
 * becomes the place's `full_name`, stored for the export and rendered nowhere.
 *
 * `attribution` rides on each result rather than in an envelope because it is a
 * licence condition of the data itself, and it must be rendered wherever the
 * result is shown.
 */
export interface GeocodeResult {
  latitude: number;
  longitude: number;
  location: string;
  display_name: string;
  // The place's own name, where it has one. Absent for an address-only result.
  name?: string | null;
  attribution: string;
  // The place's extent, when the provider gives one. All four or none: a box is
  // only meaningful whole. West may be greater than east - a box straddling the
  // antimeridian is not malformed. Absent for a reverse geocode.
  bbox_south?: number | null;
  bbox_north?: number | null;
  bbox_west?: number | null;
  bbox_east?: number | null;
}

/**
 * What a reverse geocode learned about a position, which is three things rather
 * than two.
 *
 * `nameless` and `unknown` look identical to a caller that only asks "did I get
 * a result?", and they are opposites: `nameless` is a fact about the position -
 * the API looked it up and there is no name there - while `unknown` is a fact
 * about us, and nothing at all was learned. Only the first is grounds to empty a
 * field the diver may have typed into.
 */
export type ReverseGeocode =
  | { status: "named"; result: GeocodeResult }
  | { status: "nameless" }
  | { status: "unknown" };

/**
 * Geocoding, proxied by the API rather than called from the browser: no key
 * ever reaches the client and the CSP needs no extra `connect-src` host.
 *
 * Nothing here throws for "no suggestion": a coordinate in open water is a
 * perfectly good place to dive, and the diver can always type the location in.
 * Callers should treat a thrown error as `unknown`, since geocoding is optional
 * on the API too (`GEOCODER_URL=""` switches it off) and an older API has no
 * such endpoint at all.
 */
export const geocodingAPI = {
  // Name the place at a position, so a site pinned on the map can offer a
  // `location`. The API rounds the position before looking it up and caches the
  // answer, so calling this per pin costs the provider almost nothing.
  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<ReverseGeocode> {
    const response = await apiClient.get<GeocodeResult | null>(
      `/geocode/reverse`,
      { params: { lat: latitude, lon: longitude } },
    );
    // Branched on the status rather than on the body, because axios gives a 204
    // a `data` of `""` - not `null`, not `undefined`. The obvious
    // `response.data ?? null` therefore folds "no name here" back into "could
    // not ask", which is the one distinction this call exists to draw.
    if (response.status === 204) return { status: "nameless" };
    const result = response.data;
    // A 200 with `null` is the API saying it never got to ask - switched off,
    // over its instance-wide provider cap, or the provider unreachable. It is
    // also what an API older than the 204 answers for a nameless position, and
    // reading that as `unknown` is the safe direction to be wrong in.
    return result?.location
      ? { status: "named", result }
      : { status: "unknown" };
  },

  /**
   * Find places by name, for a picker that searches as the diver types.
   *
   * An empty array means "no match" and "the provider is down, throttled or
   * switched off" alike - the API deliberately answers both the same way, and
   * neither is an error to a form whose escape hatch is typing the place in.
   * Only a thrown error (the per-user 429, a network failure) tells them apart,
   * and callers that can't act on the difference shouldn't try.
   *
   * A query outside the endpoint's own `2..200` length is answered here without
   * a request, since asking would be a 422 - which is a *rejection*, and so the
   * one failure mode this function's callers can't treat as "no match". A
   * combobox probes with "" the moment its menu opens, and a pasted paragraph
   * is the other end of the same problem.
   */
  async searchPlaces(query: string): Promise<GeocodeResult[]> {
    const q = query.trim();
    if (q.length < MIN_PLACE_QUERY_LENGTH || q.length > MAX_PLACE_QUERY_LENGTH)
      return [];
    const response = await apiClient.get<GeocodeResult[]>(`/geocode/search`, {
      params: { q },
    });
    return response.data;
  },
};
