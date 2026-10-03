import { apiClient } from "./client";

export type MapTileTheme = "light" | "dark";

/**
 * Where one tile of this instance's map is read: its theme and its square of
 * the Web Mercator grid, `z/x/y` at an integer zoom.
 *
 * Nothing of any record is in it, so the same address serves every card and
 * every page head that shows that square, for every account - and the page keeps
 * the tile under this string (`components/map/tile-requests.ts`).
 */
export function mapTileUrl(
  theme: MapTileTheme,
  z: number,
  x: number,
  y: number,
): string {
  return `/map-tiles/${theme}/${z}/${x}/${y}`;
}

export const mapTilesAPI = {
  /**
   * A map tile, as WebP bytes, at a URL `mapTileUrl` built.
   *
   * Through the API client rather than an `<img src>`, as card images are: the
   * route is for signed-in accounts and an `<img>` cannot send the bearer. The
   * API answers a tile it has not drawn yet by drawing it, so this can be held
   * open for the whole of a draw; `signal` is how a map that leaves the screen
   * lets that connection go.
   *
   * `request` rather than `get`, whose coalescing shares one pending request
   * between every caller of a URL: a map scrolled away and straight back would
   * be handed the request it had just aborted.
   */
  async getMapTile(url: string, signal: AbortSignal): Promise<Blob> {
    const response = await apiClient.request<Blob>({
      method: "get",
      url,
      responseType: "blob",
      signal,
    });
    return response.data;
  },
};
