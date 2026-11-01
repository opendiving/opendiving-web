import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { basemapStyle } from "@/lib/basemap";
import { readRuntimeConfig } from "@/lib/runtime-config";
import type { Resources } from "./resources";
import { loadStyle, readRendererConfig } from "./style";

// One basemap, two drawers: the renderer resolves the same variables with the
// web's own functions, and arrives at the style the browser would hand MapLibre.

const PUBLIC = path.resolve("public");

// What the browser's `basemapStyle` fetches the vendored pair from, served off
// the files the web would serve, on the page's own origin.
function asPage(origin: string) {
  vi.stubGlobal("window", { location: { origin } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const file = path.join(PUBLIC, new URL(url, origin).pathname);
      return new Response(readFileSync(file), { status: 200 });
    }),
  );
}

// What the renderer reads, recorded, with the vendored files served as
// `Resources` serves them.
function recordingResources(siteUrl: string) {
  const asked: string[] = [];
  const resources: Resources = {
    async get(url) {
      asked.push(url);
      const { origin, pathname } = new URL(url, siteUrl);
      if (
        origin === new URL(siteUrl).origin &&
        pathname.startsWith("/basemap/")
      ) {
        return readFileSync(path.join(PUBLIC, pathname));
      }
      return Buffer.from(
        JSON.stringify({ version: 8, sources: {}, layers: [] }),
      );
    },
  };
  return { asked, resources };
}

afterEach(() => vi.unstubAllGlobals());

describe("the renderer's basemap", () => {
  const ENVIRONMENTS = {
    "the default": { SITE_URL: "https://dives.example.com" },
    "a style URL": {
      SITE_URL: "https://dives.example.com",
      MAP_STYLE_URL: "https://maps.example.com/styles/light.json",
      MAP_STYLE_URL_DARK: "https://maps.example.com/styles/dark.json",
      MAP_ATTRIBUTION: "© Example",
    },
    "a tile URL": {
      SITE_URL: "https://dives.example.com",
      MAP_TILE_URL: "https://tiles.example.com/{z}/{x}/{y}{r}.png?key={key}",
      MAP_TILE_API_KEY: "k3y",
    },
  };

  it.each(Object.entries(ENVIRONMENTS))(
    "resolves %s as the web does",
    (_, env) => {
      expect(readRendererConfig(env).basemap).toEqual(
        readRuntimeConfig(env).basemap,
      );
    },
  );

  it.each(["light", "dark"] as const)(
    "draws the default's %s style as the browser draws it",
    async (theme) => {
      const env = ENVIRONMENTS["the default"];
      const config = readRendererConfig(env);
      asPage("https://dives.example.com");
      const { asked, resources } = recordingResources(config.siteUrl);

      const style = await loadStyle(config, theme, resources);

      expect(style).toEqual(await basemapStyle(config.basemap, theme));
      // Off the image's own files, not the network.
      expect(asked).toEqual([
        `https://dives.example.com${theme === "dark" ? "/basemap/dark.json" : "/basemap/liberty.json"}`,
      ]);
      expect(style.sprite).toBe("https://dives.example.com/basemap/sprite/ofm");
    },
  );

  it.each(["light", "dark"] as const)(
    "fetches a configured %s style from the URL the browser would",
    async (theme) => {
      const config = readRendererConfig(ENVIRONMENTS["a style URL"]);
      const { asked, resources } = recordingResources(config.siteUrl);
      await loadStyle(config, theme, resources);
      // The browser hands MapLibre the URL itself and lets it fetch.
      expect(asked).toEqual([await basemapStyle(config.basemap, theme)]);
    },
  );

  it("resolves a relative style URL against SITE_URL, as a page resolves it against itself", async () => {
    const config = readRendererConfig({
      SITE_URL: "https://dives.example.com",
      MAP_STYLE_URL: "/styles/mine.json",
      MAP_ATTRIBUTION: "© Mine",
    });
    const { asked, resources } = recordingResources(config.siteUrl);
    await loadStyle(config, "light", resources);
    expect(asked).toEqual(["https://dives.example.com/styles/mine.json"]);
  });

  it.each(["light", "dark"] as const)(
    "wraps a tile URL's %s template as the browser does, key and ratio included",
    async (theme) => {
      const config = readRendererConfig(ENVIRONMENTS["a tile URL"]);
      const { asked, resources } = recordingResources(config.siteUrl);
      const style = await loadStyle(config, theme, resources);
      expect(style).toEqual(await basemapStyle(config.basemap, theme));
      expect(JSON.stringify(style)).toContain(
        "https://tiles.example.com/{z}/{x}/{y}{ratio}.png?key=k3y",
      );
      expect(asked).toEqual([]);
    },
  );
});
