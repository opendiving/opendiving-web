import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createResources,
  describe as describeUrl,
  ResourceError,
  USER_AGENT,
} from "./resources";

const SITE_URL = "https://dives.example.com";

function publicDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "map-renderer-"));
  mkdirSync(path.join(dir, "basemap", "sprite"), { recursive: true });
  writeFileSync(path.join(dir, "basemap", "sprite", "ofm.json"), "{}");
  writeFileSync(path.join(dir, "secret.txt"), "not served");
  return dir;
}

function stubFetch(answer: (url: string) => Response | Promise<Response>) {
  return vi.fn(async (input: string | URL | Request) =>
    answer(input instanceof Request ? input.url : String(input)),
  );
}

const bytes = (text: string) => new Response(text, { status: 200 });

describe("resources", () => {
  it("names the instance to the basemap as its own pages do", async () => {
    const fetch = stubFetch(() => bytes("tile"));
    const resources = createResources({
      siteUrl: SITE_URL,
      publicDir: publicDir(),
      fetch,
    });

    await resources.get("https://tiles.example.com/planet/1/0/0.pbf");

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({
      Origin: "https://dives.example.com",
      Referer: "https://dives.example.com/",
      "User-Agent": USER_AGENT,
    });
  });

  // In static mode an error fails the whole picture, which is right for a
  // provider that is down and wrong for a tile with nothing in it.
  it("reads a 404 or a 204 as no content, not as an error", async () => {
    const resources = createResources({
      siteUrl: SITE_URL,
      publicDir: publicDir(),
      fetch: stubFetch((url) =>
        url.endsWith("empty.pbf")
          ? new Response(null, { status: 204 })
          : new Response("Not found", { status: 404 }),
      ),
    });
    expect(await resources.get("https://tiles.example.com/empty.pbf")).toBe(
      null,
    );
    expect(await resources.get("https://tiles.example.com/gone.pbf")).toBe(
      null,
    );
  });

  it("fails on any other answer, and on no answer at all", async () => {
    const resources = createResources({
      siteUrl: SITE_URL,
      publicDir: publicDir(),
      fetch: stubFetch((url) => {
        if (url.includes("down")) throw new TypeError("fetch failed");
        return new Response("Busy", { status: 503 });
      }),
    });
    await expect(
      resources.get("https://tiles.example.com/busy.pbf"),
    ).rejects.toBeInstanceOf(ResourceError);
    await expect(
      resources.get("https://down.example.com/tile.pbf"),
    ).rejects.toBeInstanceOf(ResourceError);
  });

  it("never names a key it was given in what it says about a failure", async () => {
    const resources = createResources({
      siteUrl: SITE_URL,
      publicDir: publicDir(),
      fetch: stubFetch(() => new Response("Denied", { status: 403 })),
    });
    const failure = resources.get(
      "https://tiles.example.com/1/0/0.png?api_key=s3cret",
    );
    await expect(failure).rejects.toThrow(/tiles\.example\.com\/1\/0\/0\.png/);
    await expect(failure).rejects.not.toThrow(/s3cret/);
    expect(describeUrl("https://a.example/x?key=1")).toBe(
      "https://a.example/x",
    );
  });

  it("resolves a relative URL against SITE_URL, as a page does", async () => {
    const fetch = stubFetch(() => bytes("{}"));
    const resources = createResources({
      siteUrl: SITE_URL,
      publicDir: publicDir(),
      fetch,
    });
    await resources.get("/styles/mine.json");
    expect(String(fetch.mock.calls[0][0])).toBe(
      "https://dives.example.com/styles/mine.json",
    );
  });

  it("reads this instance's /basemap/ from the image's own files", async () => {
    const fetch = stubFetch(() => bytes("from the network"));
    const resources = createResources({
      siteUrl: SITE_URL,
      publicDir: publicDir(),
      fetch,
    });

    const sprite = await resources.get(`${SITE_URL}/basemap/sprite/ofm.json`);
    expect(sprite?.toString()).toBe("{}");
    expect(await resources.get(`${SITE_URL}/basemap/sprite/none.png`)).toBe(
      null,
    );
    // Nothing outside `basemap/`, however the path is spelled.
    expect(await resources.get(`${SITE_URL}/basemap/%2E%2E%2Fsecret.txt`)).toBe(
      null,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves a second request for the same URL from its cache", async () => {
    const fetch = stubFetch(() => bytes("tile"));
    const resources = createResources({
      siteUrl: SITE_URL,
      publicDir: publicDir(),
      fetch,
    });
    const url = "https://tiles.example.com/planet/9/1/1.pbf";
    const [one, two] = await Promise.all([
      resources.get(url),
      resources.get(url),
    ]);
    const three = await resources.get(url);
    expect([one, two, three].map((data) => data?.toString())).toEqual([
      "tile",
      "tile",
      "tile",
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps its cache within its budget, the least recent out first", async () => {
    const fetch = stubFetch(() => bytes("x".repeat(400)));
    const resources = createResources({
      siteUrl: SITE_URL,
      publicDir: publicDir(),
      fetch,
      cacheBytes: 1000,
    });
    const url = (n: number) => `https://t.example/${n}.pbf`;

    await resources.get(url(1));
    await resources.get(url(2));
    await resources.get(url(1)); // now the most recent
    await resources.get(url(3)); // pushes 2 out
    expect(fetch).toHaveBeenCalledTimes(3);

    await resources.get(url(1));
    expect(fetch).toHaveBeenCalledTimes(3);
    await resources.get(url(2));
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("asks again for what it was told to keep only so long", async () => {
    vi.useFakeTimers();
    try {
      const fetch = stubFetch(() => bytes("{}"));
      const resources = createResources({
        siteUrl: SITE_URL,
        publicDir: publicDir(),
        fetch,
      });
      const tilejson = "https://tiles.example.com/planet";
      await resources.get(tilejson, { maxAgeMs: 60_000 });
      vi.advanceTimersByTime(59_000);
      await resources.get(tilejson, { maxAgeMs: 60_000 });
      expect(fetch).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(2_000);
      await resources.get(tilejson, { maxAgeMs: 60_000 });
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a scheme it has no business fetching", async () => {
    const resources = createResources({
      siteUrl: SITE_URL,
      publicDir: publicDir(),
      fetch: stubFetch(() => bytes("")),
    });
    await expect(resources.get("file:///etc/passwd")).rejects.toBeInstanceOf(
      ResourceError,
    );
  });

  it("reads a data: URL, which is how a style that needs no network is given", async () => {
    const resources = createResources({
      siteUrl: SITE_URL,
      publicDir: publicDir(),
    });
    const data = await resources.get('data:application/json,{"version":8}');
    expect(data?.toString()).toBe('{"version":8}');
  });
});
