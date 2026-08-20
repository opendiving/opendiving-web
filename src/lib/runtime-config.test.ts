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
      gravatarEnabled: false,
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
      GRAVATAR_ENABLED: "true",
      MAP_TILE_URL: "https://tiles.example/{z}/{x}/{y}.png",
      MAP_TILE_ATTRIBUTION: "© Someone",
    });

    expect(config.siteUrl).toBe("https://dives.example.com");
    expect(config.contactEmail).toBe("hello@example.com");
    expect(config.googleClientId).toBe("client-id.apps.googleusercontent.com");
    expect(config.gravatarEnabled).toBe(true);
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

  describe("GRAVATAR_ENABLED", () => {
    it("is off when unset - no third-party call until somebody asks for one", () => {
      expect(readRuntimeConfig({}).gravatarEnabled).toBe(false);
    });

    it.each(["1", "true", "TRUE", "yes", "on"])("is on for %s", (value) => {
      expect(
        readRuntimeConfig({ GRAVATAR_ENABLED: value }).gravatarEnabled,
      ).toBe(true);
    });

    it.each(["0", "false", "no", "off"])("is off for %s", (value) => {
      expect(
        readRuntimeConfig({ GRAVATAR_ENABLED: value }).gravatarEnabled,
      ).toBe(false);
    });

    // Reading an unrecognized value as either answer would be a guess at what
    // somebody meant, and one of the two guesses starts calling a third party.
    it("keeps the default and says so for anything else", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(
        readRuntimeConfig({ GRAVATAR_ENABLED: "enabled" }).gravatarEnabled,
      ).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("GRAVATAR_ENABLED=enabled"),
      );
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
        GRAVATAR_ENABLED: "yes",
      }),
    );

    expect(config).toEqual({
      googleClientId: "client-id",
      gravatarEnabled: true,
      tiles: {
        light: DEFAULT_TILE_URL,
        dark: DEFAULT_DARK_TILE_URL,
        attribution: DEFAULT_TILE_ATTRIBUTION,
      },
    });
  });
});
