import { apiClient } from "./client";

/** The records whose cards show a map picture, by the API's route segment. */
export type MapPictureKind = "dive" | "trip" | "dive-site";

export type MapPictureTheme = "light" | "dark";

/**
 * Where a record's card picture is read: its route, the theme it is drawn in,
 * and the digest the record names it by as `v`.
 *
 * The digest is what makes this the address of one picture. It changes whenever
 * this instance would draw the record differently, and the API lets the browser
 * keep the response for five minutes only while `v` is the current digest - so a
 * moved site is a new URL, never a stale picture from the browser's cache. The
 * same string is the key the page keeps the picture under
 * (`components/map/card-pictures.ts`).
 */
export function mapPictureUrl(
  kind: MapPictureKind,
  uuid: string,
  theme: MapPictureTheme,
  digest: string,
): string {
  const query = new URLSearchParams({ theme, v: digest });
  return `/${kind}/${encodeURIComponent(uuid)}/map-picture?${query}`;
}

export const mapPicturesAPI = {
  /**
   * A card's map picture, as WebP bytes, at a URL `mapPictureUrl` built.
   *
   * Through the API client rather than an `<img src>`, as card images are: the
   * route is owner-only and an `<img>` cannot send the bearer. The API answers a
   * picture it has not drawn yet by drawing it, so this can be held open for the
   * whole of a draw; `signal` is how a card that leaves the screen lets that
   * connection go.
   *
   * `request` rather than `get`, whose coalescing shares one pending request
   * between every caller of a URL: a card scrolled away and straight back would
   * be handed the request it had just aborted.
   */
  async getMapPicture(url: string, signal: AbortSignal): Promise<Blob> {
    const response = await apiClient.request<Blob>({
      method: "get",
      url,
      responseType: "blob",
      signal,
    });
    return response.data;
  },
};
