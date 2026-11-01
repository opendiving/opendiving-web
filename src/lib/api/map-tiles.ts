import { apiClient } from "./client";

export type MapTileTheme = "light" | "dark";

/**
 * Where one tile of this instance's map is read: its theme, its square of the
 * Web Mercator grid, `z/x/y` at an integer zoom, and the viewer's language.
 *
 * Nothing of any record is in it, so the same address serves every card and
 * every page head that shows that square, for every account - and the page keeps
 * the tile under this string (`components/map/tile-requests.ts`).
 *
 * The language goes as the browser states it: the API reduces it to one its
 * labels carry, or to English alone, so the tiles it stores stay bounded. Only
 * ever called in the browser, once a map has measured its frame.
 */
export function mapTileUrl(
  theme: MapTileTheme,
  z: number,
  x: number,
  y: number,
): string {
  const path = `/map-tiles/${theme}/${z}/${x}/${y}`;
  const language = typeof navigator === "undefined" ? "" : navigator.language;
  return language ? `${path}?${new URLSearchParams({ language })}` : path;
}

/** This instance's own map tiles, which the API draws on first request. */
export const mapTilesAPI = {
  /**
   * A map tile, as WebP bytes, at a URL `mapTileUrl` built.
   *
   * Through the API client rather than an `<img src>`, as card images are: the
   * route is for signed-in accounts and an `<img>` cannot send the bearer. The
   * API answers a tile it has not drawn yet by drawing it, so this can be held
   * open for the whole of a draw; `signal` is how a map that leaves the screen
   * lets that connection go.
   */
  async getMapTile(url: string, signal: AbortSignal): Promise<Blob> {
    const response = await apiClient.get<Blob>(url, {
      responseType: "blob",
      signal,
    });
    return response.data;
  },
};
