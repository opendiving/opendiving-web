// The renderer's signature: what changes when this instance would draw a
// picture differently, and nothing else.
//
// The API digests it into every picture's name, so a change is a new URL and a
// redraw of each picture on its next view. Hence what it covers: the renderer's
// own code and everything it imports - the place functions, the fit, the pin
// styles - by the sources it was built from; the installed MapLibre Native; the
// basemap this environment resolves to for both themes; and, when that is the
// vendored pair, the style and sprite files themselves. A web merge touching
// none of those keeps every stored picture, which matters because the web
// merges several times a day. Upstream tile data, and a remote style edited
// behind an unchanged URL, change pixels without changing this; a backdrop is
// allowed to lag them.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { RendererConfig } from "./style";
import { styleSource } from "./style";

export interface SignatureInputs {
  /** A digest of the sources the bundle was built from. */
  sourceDigest: string;
  /** `@maplibre/maplibre-gl-native`'s installed version. */
  nativeVersion: string;
  config: RendererConfig;
  /** The image's `public/`, which the vendored styles and sprite are read from. */
  publicDir: string;
}

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(directory, path.join(entry.parentPath, entry.name)),
    )
    .sort();
}

export async function rendererSignature({
  sourceDigest,
  nativeVersion,
  config,
  publicDir,
}: SignatureInputs): Promise<string> {
  const hash = createHash("sha256");
  // Each part on its own line, named, so no two inputs can run together into
  // the same bytes.
  const part = (name: string, value: string) =>
    hash.update(`${name}\0${value}\n`);

  part("version", "1");
  part("source", sourceDigest);
  part("maplibre-native", nativeVersion);
  // Where each theme is drawn from rather than the whole `Basemap`: its credit
  // is drawn by the web beside the picture, never into it. The vendored pair is
  // named as configured rather than against `SITE_URL`, which moves nothing in
  // it - its files are hashed below instead.
  for (const theme of ["light", "dark"] as const) {
    part(
      `style:${theme}`,
      config.basemap.vendored
        ? config.basemap[theme]
        : JSON.stringify(styleSource(config, theme)),
    );
  }
  if (config.basemap.vendored) {
    const basemapDir = path.join(publicDir, "basemap");
    for (const file of await filesUnder(basemapDir)) {
      const content = await readFile(path.join(basemapDir, file));
      part(
        `file:${file.split(path.sep).join("/")}`,
        createHash("sha256").update(content).digest("hex"),
      );
    }
  }
  return hash.digest("hex");
}
