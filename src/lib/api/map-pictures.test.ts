import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosRequestConfig } from "axios";

import { apiClient } from "./client";
import { mapPicturesAPI, mapPictureUrl } from "./map-pictures";

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

describe("mapPictureUrl", () => {
  it.each([
    ["dive", "/dive/dive-1/map-picture?theme=light&v=abc123"],
    ["trip", "/trip/dive-1/map-picture?theme=light&v=abc123"],
    ["dive-site", "/dive-site/dive-1/map-picture?theme=light&v=abc123"],
  ] as const)("names a %s's picture by its theme and digest", (kind, url) => {
    expect(mapPictureUrl(kind, "dive-1", "light", "abc123")).toBe(url);
  });

  it("escapes what it is handed", () => {
    expect(mapPictureUrl("trip", "a/b", "dark", "x&y")).toBe(
      "/trip/a%2Fb/map-picture?theme=dark&v=x%26y",
    );
  });
});

describe("mapPicturesAPI.getMapPicture", () => {
  it("asks for the picture's bytes, abortably", async () => {
    const controller = new AbortController();
    const url = mapPictureUrl("dive", "dive-1", "dark", "abc123");

    const blob = await mapPicturesAPI.getMapPicture(url, controller.signal);

    expect(blob.type).toBe("image/webp");
    const [config] = adapter.mock.calls[0];
    expect(config.url).toBe(url);
    expect(config.method).toBe("get");
    expect(config.responseType).toBe("blob");
    expect(config.signal).toBe(controller.signal);
  });

  // The client coalesces concurrent GETs of one URL into one request, so a
  // card that aborted its own would hand the abort to the next card asking.
  it("sends each ask, never sharing a request another may abort", async () => {
    const url = mapPictureUrl("trip", "trip-1", "light", "abc123");
    const first = new AbortController();

    const aborted = mapPicturesAPI.getMapPicture(url, first.signal);
    const second = mapPicturesAPI.getMapPicture(
      url,
      new AbortController().signal,
    );
    first.abort();

    await expect(aborted).rejects.toThrow();
    await expect(second).resolves.toBeInstanceOf(Blob);
  });
});
