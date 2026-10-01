// The basemap a picture is drawn on: the web's own, resolved from the same
// variables by the same functions, so on one instance a card's picture and a
// live map draw the same thing.

import { rasterStyle, type Basemap, type BasemapStyle } from "@/lib/basemap";
import { readRuntimeConfig } from "@/lib/runtime-config";
import type { Theme } from "./payload";
import { describe, type Resources } from "./resources";

type StyleDocument = Exclude<BasemapStyle, string>;

export interface RendererConfig {
  basemap: Basemap;
  /** This instance's origin, which it names itself by to the basemap. */
  siteUrl: string;
}

/**
 * What `lib/runtime-config.ts` makes of the environment, minus everything the
 * renderer has no use for. Read from the web's own module rather than again, so
 * there is one answer to "which basemap does this instance draw".
 */
export function readRendererConfig(
  env: Record<string, string | undefined> = process.env,
): RendererConfig {
  const { basemap, siteUrl } = readRuntimeConfig(env);
  return { basemap, siteUrl };
}

/**
 * Where one theme's style comes from, as the browser would find it: a raster
 * template wrapped into a style, the vendored file, or a URL - a relative one
 * resolved against `SITE_URL`, as a page resolves it against itself.
 */
export function styleSource(
  { basemap, siteUrl }: RendererConfig,
  theme: Theme,
): { document: StyleDocument } | { url: string; vendored: boolean } {
  const value = theme === "dark" ? basemap.dark : basemap.light;
  if (basemap.mode === "raster") return { document: rasterStyle(value) };
  return { url: new URL(value, siteUrl).href, vendored: basemap.vendored };
}

/**
 * One theme's style document, ready for MapLibre Native.
 *
 * The vendored pair's relative `sprite` is made absolute against this
 * instance's origin, as `basemapStyle` makes it absolute against the page's -
 * and `Resources` reads that origin's `/basemap/` from the image's own files
 * rather than over the network.
 */
export async function loadStyle(
  config: RendererConfig,
  theme: Theme,
  resources: Resources,
  options?: { maxAgeMs?: number },
): Promise<StyleDocument> {
  const source = styleSource(config, theme);
  if ("document" in source) return source.document;

  const bytes = await resources.get(source.url, options);
  if (!bytes) throw new Error(`No style at ${describe(source.url)}`);
  const style = JSON.parse(bytes.toString("utf8")) as StyleDocument;
  if (source.vendored && typeof style.sprite === "string") {
    style.sprite = new URL(style.sprite, config.siteUrl).toString();
  }
  return style;
}
