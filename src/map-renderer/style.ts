// The basemap a tile is drawn on: the web's own, resolved from the same
// variables by the same functions, so on one instance a card's tiles and a live
// map draw the same thing.

import { rasterStyle, type Basemap, type BasemapStyle } from "@/lib/basemap";
import { readRuntimeConfig } from "@/lib/runtime-config";
import type { LabelLanguage, Theme } from "./payload";
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

/**
 * The English line each name label of the vendored pair draws: the English
 * name, else the latin-script one, else the local one. Mirrored by
 * `scripts/generate-basemaps.mjs`, which writes it into both files.
 */
export const ENGLISH_NAME = [
  "coalesce",
  ["get", "name_en"],
  ["get", "name:latin"],
  ["get", "name"],
];

/**
 * `style` with each name label given `language`'s name as a second line, where
 * a place has one that differs from its English line - beside it along a line,
 * as a road name runs, and under it at a point. Without a language, `style`
 * itself.
 *
 * Only labels drawing exactly `ENGLISH_NAME` are touched, so an operator's own
 * style is drawn as written, whatever is asked.
 */
export function withLabelLanguage(
  style: StyleDocument,
  language: LabelLanguage | undefined,
): StyleDocument {
  if (!language) return style;
  const english = JSON.stringify(ENGLISH_NAME);
  const local = ["get", `name:${language}`];
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (
        layer.type !== "symbol" ||
        JSON.stringify(layer.layout?.["text-field"]) !== english
      ) {
        return layer;
      }
      const separator =
        layer.layout?.["symbol-placement"] === "line" ? " " : "\n";
      const field = [
        "let",
        "english",
        ENGLISH_NAME,
        [
          "case",
          [
            "all",
            ["has", `name:${language}`],
            ["!=", local, ["var", "english"]],
          ],
          ["concat", ["var", "english"], separator, local],
          ["var", "english"],
        ],
      ];
      return {
        ...layer,
        layout: { ...layer.layout, "text-field": field },
      } as typeof layer;
    }),
  };
}
