#!/usr/bin/env node
// Regenerates `public/world-map/{light,dark}.webp`, the Home hero's picture of
// the whole world: the shipped styles in `public/basemap/` drawn at zoom 0 -
// the one 512 px square of the grid that is the whole world - with every
// symbol layer dropped, so the picture carries no lettering. Run it after
// `generate-basemaps.mjs` changes either style.
//
// Fetches about a dozen of OpenFreeMap's tiles and nothing else: the style's
// sprite is read from `public/`, and with no symbol layer no glyph is asked
// for.

import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import mbgl from "@maplibre/maplibre-gl-native";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const outDir = path.join(publicDir, "world-map");

// A tile's own size and ratio, as the renderer draws one (`engine.ts`).
const SIZE = 512;
const RATIO = 2;
// The style's relative sprite is resolved against this, and read from disk.
const LOCAL = "https://local.invalid";
const USER_AGENT =
  "OpenDiving-WorldMap (+https://github.com/opendiving/opendiving-web)";

async function fetchResource(url) {
  if (url.startsWith(LOCAL)) {
    return readFileSync(path.join(publicDir, new URL(url).pathname));
  }
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function render(style) {
  const map = new mbgl.Map({
    ratio: RATIO,
    mode: "tile",
    request: ({ url }, callback) =>
      fetchResource(url).then(
        (data) => (data ? callback(null, { data }) : callback()),
        (error) => callback(error),
      ),
  });
  map.load(style);
  return new Promise((resolve, reject) =>
    map.render(
      { zoom: 0, center: [0, 0], width: SIZE, height: SIZE },
      (error, pixels) => {
        map.release();
        if (error) reject(error);
        else resolve(pixels);
      },
    ),
  );
}

mkdirSync(outDir, { recursive: true });
for (const [theme, file] of [
  ["light", "liberty.json"],
  ["dark", "dark.json"],
]) {
  const style = JSON.parse(
    readFileSync(path.join(publicDir, "basemap", file), "utf8"),
  );
  style.layers = style.layers.filter((layer) => layer.type !== "symbol");
  style.sprite = new URL(style.sprite, LOCAL).href;

  const pixels = await render(style);
  const dest = path.join(outDir, `${theme}.webp`);
  const info = await sharp(Buffer.from(pixels.buffer), {
    // Premultiplied, as MapLibre Native hands its pixels back.
    raw: {
      width: SIZE * RATIO,
      height: SIZE * RATIO,
      channels: 4,
      premultiplied: true,
    },
  })
    .webp({ quality: 85 })
    .toFile(dest);
  console.log(`Wrote ${dest} (${info.size} bytes)`);
}
