import { apiClient } from "./client";

/**
 * One place, normalized by the API away from whichever provider answered.
 *
 * `location` and `display_name` answer different questions. `location` is the
 * short, composed form that goes onto `dive_site.location` - divers write
 * "Dahab, Egypt", not a seven-part postal address. `display_name` is the
 * provider's full label, which is what tells two similar results apart.
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
};
