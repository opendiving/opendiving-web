// One-off script to (re)generate `src/app/favicon.ico` from `src/app/icon.svg`,
// packing PNG renders at 16/32/48px into a single multi-size .ico (the same
// "PNG-in-ICO" format the previous favicon.ico used).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.join(root, "..", "src", "app", "icon.svg");
const icoPath = path.join(root, "..", "src", "app", "favicon.ico");

const sizes = [16, 32, 48];

async function main() {
  const svg = readFileSync(svgPath);
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

main();
