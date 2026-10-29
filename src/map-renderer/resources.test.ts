import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { basemapOrigins } from "@/lib/basemap";
import {
  createResources,
  describe as describeUrl,
  ResourceError,
  USER_AGENT,
} from "./resources";
import { readRendererConfig } from "./style";

const SITE_URL = "https://dives.example.com";
// What `basemapOrigins` would hand the renderer for a basemap on these hosts.
const ORIGINS = [
  "https://tiles.example.com",
  "https://down.example.com",
  "https://t.example",
];

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
      origins: ORIGINS,
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

  // An error fails the whole render, which is right for a provider that is
  // down and wrong for a source tile with nothing in it.
  it("reads a 404 or a 204 as no content, not as an error", async () => {
    const resources = createResources({
      siteUrl: SITE_URL,
      origins: ORIGINS,
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
      origins: ORIGINS,
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
      origins: ORIGINS,
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
      origins: ORIGINS,
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
      origins: ORIGINS,
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
      origins: ORIGINS,
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
      origins: ORIGINS,
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
        origins: ORIGINS,
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
      origins: ORIGINS,
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
      origins: ORIGINS,
      publicDir: publicDir(),
    });
    const data = await resources.get('data:application/json,{"version":8}');
    expect(data?.toString()).toBe('{"version":8}');
  });

  // A style, TileJSON's `tiles` and a redirect are all the basemap host's to
  // write, so none of them may send the renderer anywhere the browser could not
  // be sent.
  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:6379/",
    "https://tiles.example.com.evil.example/1/0/0.pbf",
    "http://tiles.example.com/1/0/0.pbf",
  ])("refuses %s, which is not one of the basemap's origins", async (url) => {
    const fetch = stubFetch(() => bytes("tile"));
    const resources = createResources({
      siteUrl: SITE_URL,
      origins: ORIGINS,
      publicDir: publicDir(),
      fetch,
    });
    await expect(resources.get(url)).rejects.toBeInstanceOf(ResourceError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("follows a redirect itself, within the basemap's origins", async () => {
    const fetch = stubFetch((url) =>
      url.endsWith("/planet")
        ? new Response(null, {
            status: 302,
            headers: { location: "/planet/v2" },
          })
        : bytes("tilejson"),
    );
    const resources = createResources({
      siteUrl: SITE_URL,
      origins: ORIGINS,
      publicDir: publicDir(),
      fetch,
    });

    const data = await resources.get("https://tiles.example.com/planet");

    expect(data?.toString()).toBe("tilejson");
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://tiles.example.com/planet",
      "https://tiles.example.com/planet/v2",
    ]);
    for (const [, init] of fetch.mock.calls as unknown as [
      string,
      RequestInit,
    ][]) {
      expect(init.redirect).toBe("manual");
    }
  });

  it("refuses a redirect off the basemap's origins", async () => {
    const fetch = stubFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
    );
    const resources = createResources({
      siteUrl: SITE_URL,
      origins: ORIGINS,
      publicDir: publicDir(),
      fetch,
    });
    await expect(
      resources.get("https://tiles.example.com/planet"),
    ).rejects.toThrow(/not one of the basemap's origins/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up on a redirect that never lands", async () => {
    const fetch = stubFetch(
      () =>
        new Response(null, { status: 302, headers: { location: "/planet" } }),
    );
    const resources = createResources({
      siteUrl: SITE_URL,
      origins: ORIGINS,
      publicDir: publicDir(),
      fetch,
    });
    await expect(
      resources.get("https://tiles.example.com/planet"),
    ).rejects.toThrow(/Too many redirects/);
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  // A body the provider keeps sending. Counts what was pulled from it, so the
  // assertions below can say it was abandoned rather than read to the end.
  function endlessBody() {
    const state = { pulled: 0, cancelled: false };
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        state.pulled += 1;
        controller.enqueue(new Uint8Array(100));
      },
      cancel() {
        state.cancelled = true;
      },
    });
    return { body, state };
  }

  it("refuses a body that declares itself past the limit, unread", async () => {
    const { body, state } = endlessBody();
    const resources = createResources({
      siteUrl: SITE_URL,
      origins: ORIGINS,
      publicDir: publicDir(),
      maxBytes: 1000,
      fetch: stubFetch(
        () => new Response(body, { headers: { "content-length": "5000000" } }),
      ),
    });
    await expect(
      resources.get("https://tiles.example.com/1/0/0.pbf"),
    ).rejects.toThrow(/more than 1000 bytes/);
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThanOrEqual(1);
  });

  it("stops reading a body once it runs past the limit", async () => {
    const { body, state } = endlessBody();
    const resources = createResources({
      siteUrl: SITE_URL,
      origins: ORIGINS,
      publicDir: publicDir(),
      maxBytes: 1000,
      fetch: stubFetch(() => new Response(body)),
    });
    await expect(
      resources.get("https://tiles.example.com/1/0/0.pbf"),
    ).rejects.toThrow(/more than 1000 bytes/);
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThan(20);
  });

  it("reads a body of exactly the limit", async () => {
    const resources = createResources({
      siteUrl: SITE_URL,
      origins: ORIGINS,
      publicDir: publicDir(),
      maxBytes: 1000,
      fetch: stubFetch(() => bytes("x".repeat(1000))),
    });
    const data = await resources.get("https://tiles.example.com/1/0/0.pbf");
    expect(data?.length).toBe(1000);
  });
});

// The renderer is configured as `main.ts` configures it, against the styles this
// app ships: every URL they name has to be one it may fetch, or the default
// basemap stops drawing the moment the list is wrong. A smoke test with a
// `data:` style needs no network and would not notice.
describe("the bundled styles", () => {
  const config = readRendererConfig({ SITE_URL });
  const publicRoot = path.resolve("public");

  it.each(["liberty.json", "dark.json"])(
    "%s names nothing the renderer refuses",
    async (file) => {
      const style = readFileSync(
        path.join(publicRoot, "basemap", file),
        "utf8",
      );
      const templates = style.match(/https?:\/\/[^"']+/g) ?? [];
      const urls = templates.map((template) =>
        template
          .replace("{fontstack}", "Noto Sans Regular")
          .replace("{range}", "0-255")
          .replace("{z}", "1")
          .replace("{x}", "0")
          .replace("{y}", "0"),
      );
      const sprite = new URL(JSON.parse(style).sprite, SITE_URL).href;
      expect(urls.length).toBeGreaterThan(0);

      const fetch = stubFetch(() => bytes("ok"));
      const resources = createResources({
        siteUrl: config.siteUrl,
        publicDir: publicRoot,
        origins: basemapOrigins(config.basemap),
        fetch,
      });
      for (const url of urls) {
        expect(await resources.get(url)).not.toBeNull();
      }
      // Read from the image's own files, never fetched.
      expect(await resources.get(`${sprite}.json`)).not.toBeNull();
      expect(fetch).toHaveBeenCalledTimes(urls.length);
    },
  );
});
