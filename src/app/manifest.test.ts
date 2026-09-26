import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SITE_DESCRIPTION } from "@/lib/site-description";

import manifest from "./manifest";

// The dimensions and colour type straight from the PNG header, and whether a `tRNS`
// chunk gives an RGB image a transparent colour anyway - no image library, so this
// stays in the unit project. Transparency is the defect it guards: iOS renders a
// transparent pixel black.
function readPng(file: string) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(bytes.toString("latin1", 12, 16)).toBe("IHDR");

  const chunks: string[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    chunks.push(bytes.toString("latin1", offset + 4, offset + 8));
    offset += 12 + length;
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    // 2 is truecolour without alpha; 4 and 6 carry an alpha channel.
    colourType: bytes.readUInt8(25),
    chunks,
  };
}

describe("manifest", () => {
  it("installs the app standalone on the dashboard", () => {
    expect(manifest()).toMatchObject({
      id: "/",
      name: "OpenDiving",
      short_name: "OpenDiving",
      description: SITE_DESCRIPTION,
      start_url: "/dashboard",
      scope: "/",
      display: "standalone",
      theme_color: "#ffffff",
      background_color: "#ffffff",
    });
  });

  it("lists a 192 and a 512 icon, each for any and maskable", () => {
    expect(
      manifest().icons?.map(({ src, sizes, purpose }) => [src, sizes, purpose]),
    ).toEqual([
      ["/icon-192.png", "192x192", "any"],
      ["/icon-192.png", "192x192", "maskable"],
      ["/icon-512.png", "512x512", "any"],
      ["/icon-512.png", "512x512", "maskable"],
    ]);
  });

  it.each(manifest().icons ?? [])(
    "serves $src ($purpose) as an opaque PNG of its declared size",
    ({ src, sizes, type }) => {
      expect(type).toBe("image/png");
      const png = readPng(`public${src}`);

      expect(`${png.width}x${png.height}`).toBe(sizes);
      expect(png.colourType).toBe(2);
      expect(png.chunks).not.toContain("tRNS");
    },
  );

  it.each(["src/app/apple-icon.png", "public/apple-touch-icon.png"])(
    "ships %s as an opaque 180px PNG",
    (file) => {
      const png = readPng(file);

      expect([png.width, png.height]).toEqual([180, 180]);
      expect(png.colourType).toBe(2);
      expect(png.chunks).not.toContain("tRNS");
    },
  );

  it("serves the same tile at the root /apple-touch-icon.png", () => {
    expect(readFileSync("public/apple-touch-icon.png")).toEqual(
      readFileSync("src/app/apple-icon.png"),
    );
  });
});
