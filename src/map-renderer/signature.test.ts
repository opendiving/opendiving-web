import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { rendererSignature, type SignatureInputs } from "./signature";
import { readRendererConfig } from "./style";

// A copy of the vendored basemap, so a test can change a file in it.
function publicDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "map-renderer-"));
  cpSync(path.resolve("public", "basemap"), path.join(dir, "basemap"), {
    recursive: true,
  });
  return dir;
}

const STYLE_ENV = {
  MAP_STYLE_URL: "/styles/mine.json",
  MAP_ATTRIBUTION: "© Mine",
};

function inputs(overrides: Partial<SignatureInputs> = {}): SignatureInputs {
  return {
    sourceDigest: "1".repeat(64),
    nativeVersion: "6.4.1",
    config: readRendererConfig({ SITE_URL: "https://dives.example.com" }),
    publicDir: publicDir(),
    ...overrides,
  };
}

describe("rendererSignature", () => {
  it("is 64 lowercase hex, and the same for the same inputs", async () => {
    const same = inputs();
    const signature = await rendererSignature(same);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(await rendererSignature(same)).toBe(signature);
  });

  // Each of these would draw a picture differently.
  it("changes with the renderer's code, MapLibre Native and the basemap", async () => {
    const base = inputs();
    const signature = await rendererSignature(base);

    for (const changed of [
      { ...base, sourceDigest: "2".repeat(64) },
      { ...base, nativeVersion: "6.5.0" },
      {
        ...base,
        config: readRendererConfig({
          SITE_URL: "https://dives.example.com",
          MAP_TILE_URL: "https://tiles.example.com/{z}/{x}/{y}.png",
        }),
      },
      {
        ...base,
        config: readRendererConfig({
          SITE_URL: "https://dives.example.com",
          ...STYLE_ENV,
        }),
      },
    ]) {
      expect(await rendererSignature(changed)).not.toBe(signature);
    }
  });

  it("changes when a vendored style or sprite file does", async () => {
    const base = inputs();
    const signature = await rendererSignature(base);
    writeFileSync(
      path.join(base.publicDir, "basemap", "sprite", "ofm.json"),
      "{}",
    );
    expect(await rendererSignature(base)).not.toBe(signature);
  });

  // None of these moves a pixel, and the web merges several times a day.
  it("stays the same for what draws nothing into a picture", async () => {
    const base = inputs();
    const signature = await rendererSignature(base);
    for (const env of [
      // The credit, drawn by the web beside the picture.
      { SITE_URL: "https://dives.example.com", MAP_ATTRIBUTION: "© Somebody" },
      // Where the instance lives, which the vendored pair draws nothing from.
      { SITE_URL: "https://other.example.com" },
    ]) {
      expect(
        await rendererSignature({ ...base, config: readRendererConfig(env) }),
      ).toBe(signature);
    }
  });

  it("ignores the vendored files for a basemap that does not use them", async () => {
    const base = inputs({
      config: readRendererConfig({
        SITE_URL: "https://dives.example.com",
        ...STYLE_ENV,
      }),
    });
    const signature = await rendererSignature(base);
    writeFileSync(path.join(base.publicDir, "basemap", "liberty.json"), "{}");
    expect(await rendererSignature(base)).toBe(signature);
  });

  // A relative style URL is fetched from wherever SITE_URL says, so a new one
  // is a different style.
  it("follows SITE_URL for a relative style URL", async () => {
    const base = inputs({
      config: readRendererConfig({
        SITE_URL: "https://dives.example.com",
        ...STYLE_ENV,
      }),
    });
    const moved = {
      ...base,
      config: readRendererConfig({
        SITE_URL: "https://other.example.com",
        ...STYLE_ENV,
      }),
    };
    expect(await rendererSignature(moved)).not.toBe(
      await rendererSignature(base),
    );
  });
});
