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
 * Geocoding, proxied by the API rather than called from the browser: no key
 * ever reaches the client and the CSP needs no extra `connect-src` host.
 *
 * Both the provider being unreachable and the position resolving to nothing
 * come back as `null` rather than an error - a coordinate in open water is a
 * perfectly good place to dive, and the diver can always type the location in.
 * Callers should treat a thrown error the same way, since geocoding is optional
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
  ): Promise<GeocodeResult | null> {
    const response = await apiClient.get(`/geocode/reverse`, {
      params: { lat: latitude, lon: longitude },
    });
    return response.data ?? null;
  },
};
