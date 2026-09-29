// Regenerates `public/basemap/dark.json` from `public/basemap/liberty.json`.
// Run it after re-vendoring Liberty; `src/lib/basemap.test.ts` fails until you do.
//
// The dark style is Liberty with its paint recoloured and nothing else touched:
// same layers, filters, zoom ranges and text layout, so a place is labelled the
// same way in both themes. A separately designed dark style (OpenFreeMap's Dark,
// which this replaced) labels by its own rules - different classes, case and
// sizes - so switching theme changed what the map said, not only its colours.
//
// Colours are moved in OKLCH, which keeps a hue's lightness honest as it is
// inverted. Everything is measured against the land colour: a feature that sat
// darker than Liberty's land sits lighter than ours by a proportional amount,
// which keeps each light-theme contrast on the same side of the scale.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// [lightness, chroma, hue]. Land is a cool mid grey, lighter than the app's
// dark cards so the frame reads as a map rather than a hole. Water is a mid
// blue, clearly lighter than land.
const LAND = [0.38, 0.01, 255];
const WATER = [0.5, 0.07, 240];
// Text runs from Liberty's black (top) to its lightest grey (bottom).
const TEXT_LIGHTNESS = [0.98, 0.84];
const WATER_TEXT = [0.86, 0.06, WATER[2]];
// How far a feature moves from land, per unit it differed from Liberty's land.
const SPREAD = 0.8;
// Liberty's pastels would turn neon at these lightnesses.
const CHROMA = 0.55;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public", "basemap", "liberty.json");
const dest = path.join(root, "public", "basemap", "dark.json");

function parseColor(value) {
  const v = value.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let hex = m[1];
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
    const channel = (i) => parseInt(hex.slice(i, i + 2), 16) / 255;
    return [
      channel(0),
      channel(2),
      channel(4),
      hex.length === 8 ? channel(6) : 1,
    ];
  }
  m = v.match(/^rgba?\(([^)]*)\)$/);
  if (m) {
    const [r, g, b, a = 1] = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [r / 255, g / 255, b / 255, a];
  }
  m = v.match(/^hsla?\(([^)]*)\)$/);
  if (m) {
    const [h, s, l, a = 1] = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(parseFloat);
    const k = (n) => (n + h / 30) % 12;
    const chroma = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n) =>
      l / 100 - chroma * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4), a];
  }
  return null;
}

const toLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toGamma = (c) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

function toOklch([r, g, b]) {
  [r, g, b] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

function fromOklch([L, C, h]) {
  const A = C * Math.cos((h * Math.PI) / 180);
  const B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, toGamma(Math.max(0, c)))));
}

function format(rgb, alpha = 1) {
  const [r, g, b] = rgb.map((c) => Math.round(c * 255));
  return alpha >= 1
    ? `rgb(${r},${g},${b})`
    : `rgba(${r},${g},${b},${+alpha.toFixed(2)})`;
}

const land = fromOklch(LAND);
const water = fromOklch(WATER);
const waterText = fromOklch(WATER_TEXT);
const libertyLand = toOklch(parseColor("#f8f4f0"))[0];

function feature(rgb) {
  const [L, C, h] = toOklch(rgb);
  const lightness = LAND[0] + (libertyLand - L) * SPREAD;
  return fromOklch([Math.min(0.92, Math.max(0.08, lightness)), C * CHROMA, h]);
}

function text(rgb) {
  const [L, C, h] = toOklch(rgb);
  const [top, bottom] = TEXT_LIGHTNESS;
  return fromOklch([top - (top - bottom) * L, C * CHROMA, h]);
}

// Colours appear bare and inside expressions (`interpolate` stops), so every
// string is tried and only the ones that parse are replaced.
function recolour(value, fn) {
  if (typeof value === "string") {
    const rgba = parseColor(value);
    return rgba ? format(fn(rgba.slice(0, 3)), rgba[3]) : value;
  }
  return Array.isArray(value) ? value.map((v) => recolour(v, fn)) : value;
}

const style = JSON.parse(readFileSync(source, "utf8"));

for (const layer of style.layers) {
  const paint = layer.paint ?? {};
  const isWaterLabel = layer.id.startsWith("water") && layer.type === "symbol";
  const isWater = /^water(way)?(_|$)/.test(layer.id) && !isWaterLabel;

  for (const key of Object.keys(paint)) {
    if (!key.endsWith("-color")) continue;
    let fn = feature;
    if (layer.type === "background") fn = () => land;
    else if (isWater) fn = () => water;
    else if (key === "text-halo-color")
      fn = () => (isWaterLabel ? water : land);
    else if (key === "text-color") fn = isWaterLabel ? () => waterText : text;
    paint[key] = recolour(paint[key], fn);
  }

  // Liberty leaves a few road names haloless, readable dark-on-light only.
  if (paint["text-color"] && !paint["text-halo-color"]) {
    paint["text-halo-color"] = format(land, 0.8);
    paint["text-halo-width"] ??= 1;
  }

  // The Natural Earth relief is a light raster; dimmed, it stays texture.
  if (layer.type === "raster") {
    paint["raster-brightness-max"] = 0.7;
    paint["raster-saturation"] = -0.3;
  }

  layer.paint = paint;
}

writeFileSync(dest, JSON.stringify(style));
console.log(`Wrote ${path.relative(root, dest)}`);
