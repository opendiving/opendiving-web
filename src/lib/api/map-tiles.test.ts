import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosRequestConfig } from "axios";

import { apiClient } from "./client";
import { mapTilesAPI, mapTileUrl } from "./map-tiles";

// Through the real client, with its adapter swapped out: what is under test is
// what reaches the wire - the route, the bytes asked for as a blob, the signal -
// and that two asks for one URL are two requests rather than one shared.

const originalAdapter = apiClient.defaults.adapter;
const adapter = vi.fn(async (config: AxiosRequestConfig) => ({
  data: new Blob(["webp"], { type: "image/webp" }),
  status: 200,
  statusText: "OK",
  headers: {},
  config,
}));

beforeEach(() => {
  adapter.mockClear();
  apiClient.defaults.adapter = adapter as never;
});
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

describe("mapTileUrl", () => {
  it.each([
    ["light", 9, 300, 215, "/map-tiles/light/9/300/215"],
    ["dark", 0, 0, 0, "/map-tiles/dark/0/0/0"],
  ] as const)(
    "names a %s tile by its square of the grid",
    (theme, z, x, y, url) => {
      expect(mapTileUrl(theme, z, x, y)).toBe(url);
    },
  );
});

describe("mapTilesAPI.getMapTile", () => {
  it("asks for the tile's bytes, abortably", async () => {
    const controller = new AbortController();
    const url = mapTileUrl("dark", 9, 300, 215);

    const blob = await mapTilesAPI.getMapTile(url, controller.signal);

    expect(blob.type).toBe("image/webp");
    const [config] = adapter.mock.calls[0];
    expect(config.url).toBe(url);
    expect(config.method).toBe("get");
    expect(config.responseType).toBe("blob");
    expect(config.signal).toBe(controller.signal);
  });

  // The client coalesces concurrent GETs of one URL into one request, so a
  // map that aborted its own would hand the abort to the next map asking.
  it("sends each ask, never sharing a request another may abort", async () => {
    const url = mapTileUrl("light", 9, 300, 215);
    const first = new AbortController();

    const aborted = mapTilesAPI.getMapTile(url, first.signal);
    const second = mapTilesAPI.getMapTile(url, new AbortController().signal);
    first.abort();

    await expect(aborted).rejects.toThrow();
    await expect(second).resolves.toBeInstanceOf(Blob);
  });
});
