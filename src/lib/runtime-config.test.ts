import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SITE_URL,
  publicConfig,
  readRuntimeConfig,
} from "./runtime-config";
import {
  DEFAULT_DARK_TILE_URL,
  DEFAULT_TILE_ATTRIBUTION,
  DEFAULT_TILE_URL,
} from "./map-tiles";

describe("readRuntimeConfig", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("configures nothing from an empty environment", () => {
    const config = readRuntimeConfig({});

    expect(config).toEqual({
      siteUrl: DEFAULT_SITE_URL,
      contactEmail: undefined,
      googleClientId: undefined,
      hstsEnabled: true,
      noindex: false,
      tiles: {
        light: DEFAULT_TILE_URL,
        dark: DEFAULT_DARK_TILE_URL,
        attribution: DEFAULT_TILE_ATTRIBUTION,
      },
    });
  });

  it("reads the plain names", () => {
    const config = readRuntimeConfig({
      SITE_URL: "https://dives.example.com",
      CONTACT_EMAIL: "hello@example.com",
      GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
      MAP_TILE_URL: "https://tiles.example/{z}/{x}/{y}.png",
      MAP_TILE_ATTRIBUTION: "© Someone",
    });

    expect(config.siteUrl).toBe("https://dives.example.com");
    expect(config.contactEmail).toBe("hello@example.com");
    expect(config.googleClientId).toBe("client-id.apps.googleusercontent.com");
    expect(config.tiles.light).toBe("https://tiles.example/{z}/{x}/{y}.png");
    expect(config.tiles.attribution).toBe("© Someone");
  });

  // The whole point of the fallback: a deployment that configured the old,
  // build-time names keeps working after this module took the reading over.
  it("falls back to the NEXT_PUBLIC_ name", () => {
    const config = readRuntimeConfig({
      NEXT_PUBLIC_SITE_URL: "https://old.example.com",
      NEXT_PUBLIC_CONTACT_EMAIL: "hello@example.com",
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: "old-client-id",
      NEXT_PUBLIC_MAP_TILE_URL: "https://old-tiles.example/{z}/{x}/{y}.png",
    });

    expect(config.siteUrl).toBe("https://old.example.com");
    expect(config.contactEmail).toBe("hello@example.com");
    expect(config.googleClientId).toBe("old-client-id");
    expect(config.tiles.light).toBe(
      "https://old-tiles.example/{z}/{x}/{y}.png",
    );
  });

  it("prefers the plain name over the NEXT_PUBLIC_ one", () => {
    const config = readRuntimeConfig({
      SITE_URL: "https://new.example.com",
      NEXT_PUBLIC_SITE_URL: "https://old.example.com",
    });

    expect(config.siteUrl).toBe("https://new.example.com");
  });

  // A variable set to nothing in a `.env` file is somebody who deleted a value,
  // not somebody who configured an empty string.
  it("treats a blank value as unset", () => {
    const config = readRuntimeConfig({
      CONTACT_EMAIL: "   ",
      GOOGLE_CLIENT_ID: "",
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: "fallback-client-id",
    });

    expect(config.contactEmail).toBeUndefined();
    expect(config.googleClientId).toBe("fallback-client-id");
  });

  it("trims a value that a quote or a stray space crept into", () => {
    expect(
      readRuntimeConfig({ CONTACT_EMAIL: " hi@example.com " }).contactEmail,
    ).toBe("hi@example.com");
  });

  describe("WEB_HSTS and WEB_NOINDEX", () => {
    it.each(["0", "false", "no", "off"])("WEB_HSTS=%s turns HSTS off", (v) => {
      expect(readRuntimeConfig({ WEB_HSTS: v }).hstsEnabled).toBe(false);
    });

    it.each(["1", "true", "yes", "on"])(
      "WEB_NOINDEX=%s closes the site",
      (v) => {
        expect(readRuntimeConfig({ WEB_NOINDEX: v }).noindex).toBe(true);
      },
    );

    // Reading an unrecognized value as either answer would be a guess at what
    // somebody meant, and the guess is invisible either way - a site quietly left
    // open to crawlers looks exactly like one deliberately left open.
    it("keeps the default and says so for anything else", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(readRuntimeConfig({ WEB_NOINDEX: "enabled" }).noindex).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("WEB_NOINDEX=enabled"),
      );
    });

    // Both are new names, so there is no build-time spelling of them to honour - and
    // offering one would invite an operator to set a variable that reaches the browser
    // for a decision only the server makes.
    it("ignores a NEXT_PUBLIC_ spelling of either", () => {
      const config = readRuntimeConfig({
        NEXT_PUBLIC_WEB_HSTS: "off",
        NEXT_PUBLIC_WEB_NOINDEX: "true",
      });

      expect(config.hstsEnabled).toBe(true);
      expect(config.noindex).toBe(false);
    });
  });

  describe("SITE_URL", () => {
    // `metadataBase` is a `new URL(...)` built in the root layout, so a value that
    // throws would take every page down over an OpenGraph tag.
    it("falls back and warns rather than letting the layout throw", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(readRuntimeConfig({ SITE_URL: "dives.example.com" }).siteUrl).toBe(
        DEFAULT_SITE_URL,
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("dives.example.com"),
      );
    });

    // "htp://" parses happily as a non-special scheme, so nothing throws - it just
    // reaches crawlers as an `og:url` nobody can fetch.
    it("rejects a mistyped scheme", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(
        readRuntimeConfig({ SITE_URL: "htp://dives.example.com" }).siteUrl,
      ).toBe(DEFAULT_SITE_URL);
    });

    it("keeps a port and a scheme it can serve from", () => {
      expect(
        readRuntimeConfig({ SITE_URL: "http://192.168.1.4:3000" }).siteUrl,
      ).toBe("http://192.168.1.4:3000");
    });
  });
});

describe("publicConfig", () => {
  // Not a filter over the whole config: a server-only value added later should have
  // to be listed here before it reaches anyone's browser.
  it("carries only what the browser is given", () => {
    const config = publicConfig(
      readRuntimeConfig({
        SITE_URL: "https://dives.example.com",
        CONTACT_EMAIL: "hello@example.com",
        GOOGLE_CLIENT_ID: "client-id",
      }),
    );

    expect(config).toEqual({
      googleClientId: "client-id",
      tiles: {
        light: DEFAULT_TILE_URL,
        dark: DEFAULT_DARK_TILE_URL,
        attribution: DEFAULT_TILE_ATTRIBUTION,
      },
    });
  });
});
