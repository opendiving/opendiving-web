// Regenerates every raster of the mark from `src/app/icon.svg`: `src/app/favicon.ico`
// (PNG renders at 16/32/48px packed into one multi-size .ico, the "PNG-in-ICO"
// format), the web app manifest's `public/icon-192.png` and `public/icon-512.png`,
// and the 180px `src/app/apple-icon.png` with its copy at `public/apple-touch-icon.png`.
// All five are committed, and running this again reproduces each of them byte for
// byte - check that after any change.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = path.join(root, "src", "app", "icon.svg");
const icoPath = path.join(root, "src", "app", "favicon.ico");

const sizes = [16, 32, 48];

// The home-screen tiles invert the favicon: the mark in white on an opaque square of
// its own coral, which reads on a home screen where a white tile sits unnoticed among
// the system's white icons. The whole mark sits inside the maskable safe zone - the
// centred circle whose diameter is 80% of the side - so one file serves `any` and
// `maskable`, and iOS's corner rounding cuts nothing off. Centred on its painted
// extent, the mark's farthest point is 12.47 units from the tile's centre (the small
// bubble: centre 9.62 away, radius 1.6, plus half the 2.5 stroke), so a 5-unit margin
// makes a 34-unit tile whose safe radius is 13.6. No alpha channel: iOS renders a
// transparent pixel black.
//
// The root `/apple-touch-icon.png` is for iOS adding a page it has not loaded, which is
// what Firefox and other third-party browsers ask for: iOS then reads no `<link>` or
// manifest, only probes that fixed path, and draws a letter when it 404s.
const TILE_MARGIN = 5;
const tiles = [
  { size: 192, file: path.join(root, "public", "icon-192.png") },
  { size: 512, file: path.join(root, "public", "icon-512.png") },
  { size: 180, file: path.join(root, "src", "app", "apple-icon.png") },
  { size: 180, file: path.join(root, "public", "apple-touch-icon.png") },
];

// The box the mark's circles paint, stroke included, in its own viewBox. The mark
// sits right of and above that viewBox's centre, so a tile centring the viewBox
// shows unequal margins. Only circles are read: a mark drawn with anything else
// needs this extending.
function paintedBounds(markSvg) {
  const halfStroke = Number(markSvg.match(/stroke-width="([\d.]+)"/)[1]) / 2;
  const circles = [
    ...markSvg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g),
  ].map((match) => match.slice(1).map(Number));
  if (circles.length === 0) throw new Error("No <circle> found in the mark");
  const reach = ([cx, cy, r], axis, sign) =>
    (axis === "x" ? cx : cy) + sign * (r + halfStroke);
  return {
    minX: Math.min(...circles.map((c) => reach(c, "x", -1))),
    maxX: Math.max(...circles.map((c) => reach(c, "x", 1))),
    minY: Math.min(...circles.map((c) => reach(c, "y", -1))),
    maxY: Math.max(...circles.map((c) => reach(c, "y", 1))),
  };
}

function tileSvg(markSvg, size) {
  const side = 24 + 2 * TILE_MARGIN;
  // The mark is nested as its own 24x24 viewport, so it is drawn exactly as the
  // favicon draws it, shifted so its painted box rather than its viewBox is centred;
  // the outer viewBox only adds the margin around it. The file's leading comment comes
  // along, which is legal inside an element and renders nothing.
  const { minX, maxX, minY, maxY } = paintedBounds(markSvg);
  const x = 12 - (minX + maxX) / 2;
  const y = 12 - (minY + maxY) / 2;
  const coral = markColour(markSvg);
  const mark = markSvg
    .replaceAll(coral, "#FFFFFF")
    .replace("<svg ", `<svg x="${x}" y="${y}" width="24" height="24" `);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-TILE_MARGIN} ${-TILE_MARGIN} ${side} ${side}">` +
      `<rect x="${-TILE_MARGIN}" y="${-TILE_MARGIN}" width="${side}" height="${side}" fill="${coral}"/>` +
      mark +
      `</svg>`,
  );
}

// Read from the mark's stroke, so `icon.svg` stays the one place the colour is set.
function markColour(markSvg) {
  return markSvg.match(/stroke="(#[0-9A-Fa-f]{6})"/)[1];
}

async function writeFavicon(svg) {
  const pngs = await Promise.all(
    sizes.map((size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()),
  );

  // ICONDIR header: reserved(2)=0, type(2)=1 (icon), count(2)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);

  const dirEntrySize = 16;
  let offset = header.length + dirEntrySize * sizes.length;
  const dirEntries = [];
  const imageBuffers = [];

  sizes.forEach((size, i) => {
    const png = pngs[i];
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // image size
    entry.writeUInt32LE(offset, 12); // image offset
    offset += png.length;
    dirEntries.push(entry);
    imageBuffers.push(png);
  });

  const ico = Buffer.concat([header, ...dirEntries, ...imageBuffers]);
  writeFileSync(icoPath, ico);
  console.log(`Wrote ${icoPath} (${ico.length} bytes, sizes: ${sizes.join(", ")})`);
}

async function writeTiles(svg) {
  const markSvg = svg.toString("utf8");
  for (const { size, file } of tiles) {
    const info = await sharp(tileSvg(markSvg, size))
      .flatten({ background: markColour(markSvg) })
      .png({ compressionLevel: 9 })
      .toFile(file);
    console.log(`Wrote ${file} (${info.size} bytes, ${info.width}x${info.height})`);
  }
}

async function main() {
  const svg = readFileSync(svgPath);
  await writeFavicon(svg);
  await writeTiles(svg);
}

main();
