// One-off script to (re)generate `public/reef-mask.png` from the CC0 source in
// `assets/artwork/`. The source is committed so this stays reproducible: a
// 19 KB mask is a dead end on its own, and regenerating it at another size -
// or keeping the interior stipple, which this pipeline deliberately discards -
// needs the 318 KB original that svgsilh may not host forever.
//
// What each step is for:
//
//   density 150   The source declares 810x1280pt. Rasterising at 400 would ask
//                 sharp for 32 megapixels and hit its input limit; 150 gives
//                 1687px wide, comfortably above the 512 we resize down to.
//   resize 512    The accent renders about 280px wide, so 512 covers a 2x
//                 display with room to spare. 1024 was 12x the bytes for
//                 detail that is invisible at 25% opacity.
//   extractChannel(3)
//                 Keep only alpha. The drawing's polyp stipple is thousands of
//                 tiny loops - high-frequency detail that PNG and WebP both
//                 spend bits on and that nothing at this size can resolve.
//                 Discarding three channels is what takes 318 KB to 19 KB.
//   palette, 2 colours
//                 The result is a silhouette: white shape, black ground, no
//                 alpha channel of its own. That is why `.hero-reef` in
//                 globals.css must set `mask-mode: luminance` - the default
//                 `match-source` reads a missing alpha as fully opaque and
//                 paints the whole box.
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, "..", "assets", "artwork", "reef-svgsilh-1298776.svg");
const dest = path.join(root, "..", "public", "reef-mask.png");

const alpha = await sharp(src, { density: 150 })
  .resize({ width: 512 })
  .ensureAlpha()
  .extractChannel(3)
  .toBuffer();

const info = await sharp(alpha)
  .png({ compressionLevel: 9, colours: 2, palette: true })
  .toFile(dest);

console.log(`Wrote ${dest} (${info.size} bytes, ${info.width}x${info.height})`);
