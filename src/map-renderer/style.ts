// The basemap a tile is drawn on: the web's own, resolved from the same
// variables by the same functions, so on one instance a card's tiles and a live
// map show the same map, a tile's lettering quieter (`tileStyle`).

import {
  MIN_ZOOM,
  rasterStyle,
  type Basemap,
  type BasemapStyle,
} from "@/lib/basemap";
import { readRuntimeConfig } from "@/lib/runtime-config";
import type { Theme } from "./payload";
import { describe, type Resources } from "./resources";

type StyleDocument = Exclude<BasemapStyle, string>;

// How strongly a tile draws the basemap's labels. A tile lies under a card's or
// a page head's own text, and at full strength its labels are that text's
// colour and weight.
const TILE_LABEL_OPACITY = 0.5;

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

/**
 * What a tile at `zoom` draws of a style: its labels at `TILE_LABEL_OPACITY`,
 * and at `MIN_ZOOM`, the whole world, neither labels nor borders, as
 * `scripts/generate-world-map.mjs` draws the Home hero's picture. See
 * DECISIONS.md, "A tile draws its labels at half strength, and none of the
 * whole world".
 */
export function tileStyle(style: StyleDocument, zoom: number): StyleDocument {
  if (zoom === MIN_ZOOM) {
    return {
      ...style,
      layers: style.layers.filter(
        (layer) =>
          layer.type !== "symbol" &&
          !("source-layer" in layer && layer["source-layer"] === "boundary"),
      ),
    };
  }
  return {
    ...style,
    layers: style.layers.map((layer) =>
      layer.type === "symbol"
        ? {
            ...layer,
            paint: {
              ...layer.paint,
              "text-opacity": TILE_LABEL_OPACITY,
              "icon-opacity": TILE_LABEL_OPACITY,
            },
          }
        : layer,
    ),
  };
}
