// What basemap this instance draws, and what the browser has to be allowed to
// fetch to draw it.
//
// The renderer is MapLibre GL JS, which speaks one language for both modes: a
// style. A vector style is a document naming sources, glyphs, sprites and 111
// layers of cartography; a raster tile server is the same document with one
// source and one layer, which is what `rasterStyle` builds. So the escape hatch
// is not a second renderer, it is a smaller style.
//
// See DECISIONS.md, "The basemap is a MapLibre style, and raster is the escape
// hatch".

import type { MapOptions } from "maplibre-gl";

/**
 * What MapLibre will accept as a style: a parsed document, or a URL it fetches
 * for itself.
 *
 * Derived from `MapOptions` rather than imported as `StyleSpecification`, which
 * `maplibre-gl` re-exports from `@maplibre/maplibre-gl-style-spec` but does not
 * export itself - naming that package here would be a dependency on a
 * transitive one, for a type.
 */
export type BasemapStyle = NonNullable<MapOptions["style"]>;
type StyleDocument = Exclude<BasemapStyle, string>;

// One direction only, and it is the direction that survives: `map-tiles.ts` is
// the hand-rolled renderer's arithmetic and goes away with the picker, at which
// point these four move into this file. Importing the other way would be a
// cycle, which `code-quality.yml` fails on.
import {
  clampLatitude,
  DEFAULT_TILE_ATTRIBUTION,
  MAX_LATITUDE,
  wrapLongitude,
  type LatLonBounds,
} from "@/lib/map-tiles";

/**
 * The styles this app ships, served from `public/basemap/`.
 *
 * OpenFreeMap's Liberty and Dark, vendored rather than fetched from
 * `tiles.openfreemap.org/styles/...` on purpose: the vendored copy is what keeps
 * the map looking the same after an upstream restyle, and a basemap that changes
 * appearance under the app is a regression nobody committed. They are also the
 * one part of this an operator can replace without a rebuild - they are static
 * files, not bundle contents.
 */
export const DEFAULT_STYLE_URL = "/basemap/liberty.json";
export const DEFAULT_STYLE_URL_DARK = "/basemap/dark.json";

/**
 * The one host the vendored pair fetches from.
 *
 * Every asset both styles name - the vector source, the Natural Earth raster
 * underlay, the glyph ranges - is on this origin; only the sprite set travels
 * with us. `basemap.test.ts` reads the shipped JSON and fails if a re-vendor
 * ever introduces a second host, which is the check that keeps this constant
 * honest rather than merely current.
 */
export const DEFAULT_BASEMAP_ORIGIN = "https://tiles.openfreemap.org";

/**
 * The credit the vendored pair owes.
 *
 * OpenMapTiles and OpenStreetMap are the required half; OpenFreeMap's own name
 * is optional and named anyway, because an operator reading their own map's
 * corner should be able to tell where the tiles come from. Written in the
 * `[label](url)` syntax `parseAttribution` understands - MapLibre's own
 * `AttributionControl` is switched off, since it renders HTML and
 * `react/no-danger` is an error here.
 */
export const DEFAULT_BASEMAP_ATTRIBUTION =
  "[OpenFreeMap](https://openfreemap.org/) " +
  "[© OpenMapTiles](https://openmaptiles.org/) " +
  "Data from [OpenStreetMap](https://www.openstreetmap.org/copyright)";

/**
 * Zoom, in MapLibre's units.
 *
 * MapLibre measures zoom against a **512 px** tile - its transform's `worldSize`
 * is `512 * 2 ** zoom` - while `lib/map-tiles.ts`, Leaflet and the whole slippy
 * convention measure against 256. The same view is therefore one number *lower*
 * here than in the numbers this app used before the renderer changed, which is
 * why these three are not the constants they replace:
 *
 * | view              | slippy (`map-tiles.ts`) | MapLibre |
 * | ----------------- | ----------------------- | -------- |
 * | widest useful     | `MIN_ZOOM` 1            | 0        |
 * | street level      | `MAX_ZOOM` 18           | 17       |
 * | a lone place      | `MAX_FIT_ZOOM` 10       | 9        |
 *
 * Carried across as the same integers they would each open one level too deep.
 * `basemap.test.ts` pins the relationship, against the two slippy constants the
 * picker still exports and against the third written out there, so that moving
 * one without the other fails rather than merely looking odd.
 */
export const MIN_ZOOM = 0;
export const MAX_ZOOM = 17;

/**
 * How far in a fit is allowed to go for a lone place, which would otherwise fit
 * at any zoom you like and open at the deepest.
 *
 * A single pin opens where the surrounding coast is recognisable rather than at
 * street level, where a lone marker on a grid of house numbers says nothing -
 * and, for the half of dive sites that are offshore, on nothing but open water.
 */
export const MAX_FIT_ZOOM = 9;

/** What an operator configured about the basemap, before defaults are applied. */
export interface BasemapConfig {
  /** A complete MapLibre style. Wins over the raster template outright. */
  styleUrl?: string;
  /** Falls back to `styleUrl`, never to the style this app ships. */
  styleUrlDark?: string;
  /** A `{z}/{x}/{y}` raster template - the escape hatch. */
  tileUrl?: string;
  /** Falls back to `tileUrl`, never to a stranger's. */
  tileUrlDark?: string;
  /**
   * Rendered over whichever basemap is active. Deliberately not part of either
   * mode's group of variables: an operator who configures a style must be able
   * to credit it, and there is exactly one credit on screen at a time.
   */
  attribution?: string;
  /** Substituted for `{key}` in either raster template. */
  apiKey?: string;
}

/** The basemap this instance draws, with the defaults applied. */
export interface Basemap {
  /**
   * `vector` means `light`/`dark` are MapLibre style URLs; `raster` means they
   * are `{z}/{x}/{y}` templates that `rasterStyle` wraps into one.
   */
  mode: "vector" | "raster";
  /**
   * Whether `light`/`dark` name the styles this app ships. It decides two
   * things a URL alone cannot: that the style JSON needs its relative `sprite`
   * resolved before MapLibre sees it, and that `DEFAULT_BASEMAP_ORIGIN` is what
   * the policy has to allow.
   */
  vendored: boolean;
  light: string;
  dark: string;
  attribution: string;
}

// The placeholder a keyed provider's template carries. Every one of them spells
// the parameter differently - CARTO `?key=`, Stadia `?api_key=` - so the query
// string belongs to the operator's template and only the value comes from here.
const API_KEY = "{key}";

function withApiKey(template: string, apiKey?: string): string {
  if (!template.includes(API_KEY)) return template;
  if (!apiKey) {
    console.warn(
      `[basemap] Tile template wants an API key but MAP_TILE_API_KEY is ` +
        `unset: ${template}. Tiles will be requested with an empty key.`,
    );
  }
  // split/join rather than a `/g` regex: `.test()` on a global regex advances
  // its own lastIndex, so the same template can answer differently on the
  // second call.
  return template.split(API_KEY).join(apiKey ?? "");
}

/**
 * The message a style configured without a credit fails with.
 *
 * Exported so the test asserts the text an operator actually reads rather than
 * a substring of it - this is the whole of the diagnostic for a startup that
 * refuses to serve.
 */
export const MISSING_ATTRIBUTION_MESSAGE =
  "[basemap] MAP_STYLE_URL is set but MAP_ATTRIBUTION is not. Every basemap " +
  "worth pointing at carries a licence condition, and this app renders the " +
  "credit itself rather than the style's own HTML - so it cannot work out " +
  "what yours requires. Set MAP_ATTRIBUTION to the credit your style asks " +
  "for, or unset MAP_STYLE_URL to use the basemap this app ships.";

/**
 * The basemap to draw, or a thrown configuration error.
 *
 * Three states, and the precedence between them is documented rather than
 * emergent: a style URL wins outright and leaves the raster variables inert, a
 * raster template without one is the escape hatch, and neither is the pair this
 * app ships.
 *
 * **A style URL without an attribution throws**, and that is the only
 * combination that does. It cannot default to "whatever the active basemap
 * requires", because both ways of learning that are shut: this runs in the
 * request path and may not fetch and parse a remote style, and the app renders
 * the credit as text rather than as the style's HTML. Of the three answers
 * available, defaulting to this app's own credit ships a false statement and a
 * licence breach for any style that is not OpenFreeMap's, and rendering nothing
 * breaches the licence of essentially every OSM-derived source. Refusing is the
 * only one that is neither wrong nor silent.
 *
 * It throws here - once, at config resolution - rather than per map. Note what
 * that does *not* mean: `runtimeConfig()` is lazy and memoized, so the process
 * starts normally and the throw lands on the first request that renders a
 * layout or passes through middleware. Every page then 500s while `/healthz`,
 * which sits outside the middleware matcher and reads no configuration, goes on
 * answering 200 - so the container's own healthcheck reports it healthy. Loud,
 * but only to somebody opening a page.
 */
export function resolveBasemap(config: BasemapConfig = {}): Basemap {
  const { styleUrl, styleUrlDark, tileUrl, tileUrlDark, attribution, apiKey } =
    config;

  if (styleUrl) {
    if (!attribution) throw new Error(MISSING_ATTRIBUTION_MESSAGE);
    return {
      mode: "vector",
      vendored: false,
      light: styleUrl,
      // "Use my style", not "use mine by day and a stranger's by night" - the
      // same rule the raster templates have always followed.
      dark: styleUrlDark || styleUrl,
      attribution,
    };
  }

  // A dark style with no light one to belong to would mix this app's
  // cartography with somebody else's on a theme toggle, and would credit one of
  // them for both. Ignored rather than promoted, and said out loud because a
  // variable that silently does nothing is worse than one that errors.
  if (styleUrlDark) {
    console.warn(
      `[basemap] Ignoring MAP_STYLE_URL_DARK, which is set while ` +
        `MAP_STYLE_URL is not. Set both, or neither.`,
    );
  }

  if (tileUrl) {
    const light = withApiKey(tileUrl, apiKey);
    return {
      mode: "raster",
      vendored: false,
      light,
      dark: tileUrlDark ? withApiKey(tileUrlDark, apiKey) : light,
      attribution: attribution || DEFAULT_TILE_ATTRIBUTION,
    };
  }

  return {
    mode: "vector",
    vendored: true,
    light: DEFAULT_STYLE_URL,
    dark: DEFAULT_STYLE_URL_DARK,
    attribution: attribution || DEFAULT_BASEMAP_ATTRIBUTION,
  };
}

/**
 * What MapLibre spells the high-density placeholder.
 *
 * This app's own templates have always written it `{r}`, as Leaflet and
 * OpenLayers do and as `.env.example`'s two keyed blocks still say. MapLibre
 * resolves `{ratio}` instead, from `map.getPixelRatio()`, to exactly the same
 * `@2x`/empty pair - so the escape hatch is a rename here and no density
 * plumbing of our own. Without it a keyed template would request a literal
 * `{r}` and 404, which is precisely the two configurations this mode exists to
 * preserve.
 */
export function withRatioToken(template: string): string {
  return template.replace(/\{r\}/g, "{ratio}");
}

/**
 * A minimal MapLibre style around one raster tile template.
 *
 * `tileSize` is stated rather than left to the spec, whose default is 512: every
 * template this app documents serves 256 px tiles, and taking the default would
 * draw each of them over four tiles' worth of ground.
 */
export function rasterStyle(template: string): StyleDocument {
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [withRatioToken(template)],
        tileSize: 256,
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}

/**
 * The style to hand MapLibre for one theme.
 *
 * Three shapes, and only one of them needs us in the middle. A configured style
 * URL is handed over as a URL, because MapLibre fetching it itself is both
 * fewer moving parts and how a remote style's own relative references resolve. A
 * raster template becomes the generated document above. The vendored pair is
 * fetched *here*, for one reason:
 *
 * **MapLibre will not resolve a relative `sprite`.** `normalizeSpriteURL` runs
 * the value through `new URL(value)` with no base and throws "must be absolute"
 * on anything else - unlike a style's *sources*, which do go through
 * `browser.resolveURL`. So a vendored style that also vendors its sprite cannot
 * express that relationship in the file, and the absolute form cannot be baked
 * in either: a published image runs on whatever domain a self-hoster gives it.
 * Resolving it against this document's own origin at load time is what is left,
 * and it is one line.
 */
export async function basemapStyle(
  basemap: Basemap,
  theme: "light" | "dark",
): Promise<BasemapStyle> {
  const value = theme === "dark" ? basemap.dark : basemap.light;
  if (basemap.mode === "raster") return rasterStyle(value);
  if (!basemap.vendored) return value;

  const response = await fetch(value);
  if (!response.ok) {
    throw new Error(
      `[basemap] Could not load the bundled style ${value}: ` +
        `${response.status} ${response.statusText}. It is served from ` +
        `public/basemap/, so a 404 here means the file did not reach the image.`,
    );
  }
  const style = (await response.json()) as StyleDocument;
  if (typeof style.sprite === "string") {
    style.sprite = new URL(style.sprite, window.location.origin).toString();
  }
  return style;
}

/**
 * The origins the browser will contact to draw this basemap, for the CSP
 * `connect-src` in `proxy.ts`.
 *
 * `connect-src` and not `img-src`, in both modes, and that is not a choice:
 * MapLibre's image decoder takes an `ArrayBuffer` and goes `Blob` ->
 * `createImageBitmap`, so even raster tile *bytes* arrive by `fetch`. It holds
 * because `refreshExpiredTiles` defaults to `true` - reading the cache header
 * requires the fetch path - which is why nothing here sets that option. Treat it
 * as part of the policy rather than as a tuning knob.
 *
 * A malformed value yields no origin rather than throwing. This runs in
 * middleware, in the request path, so a typo'd variable must not take the site
 * down over the map.
 */
export function basemapOrigins(basemap: Basemap): string[] {
  // The vendored styles are same-origin documents, but everything they name -
  // tiles, glyphs, the Natural Earth underlay - is not.
  if (basemap.vendored) return [DEFAULT_BASEMAP_ORIGIN];

  const origins = [basemap.light, basemap.dark].flatMap((value) => {
    try {
      const { origin, protocol } = new URL(value);
      // `new URL` only throws when there is no parseable scheme at all. A typo
      // like "htp://" parses happily as a non-special scheme and yields the
      // opaque origin "null", which reaches the policy as the literal token
      // `null` - discarded by browsers as an invalid source with nothing said
      // about why.
      if (protocol !== "http:" && protocol !== "https:")
        throw new Error(protocol);
      return [origin];
    } catch {
      // A relative value is the one shape that is *not* a mistake: an operator
      // may point MAP_STYLE_URL at a style they serve themselves, which `'self'`
      // already covers. Everything else earns the diagnostic, because the
      // failure it prevents is a blocked request with a console line nobody
      // reads rather than a visibly wrong URL.
      if (!value.startsWith("/")) {
        console.warn(
          `[basemap] Ignoring malformed basemap URL: ${value}. Give an ` +
            `absolute URL, or the map will be blocked by the ` +
            `Content-Security-Policy.`,
        );
      }
      return [];
    }
  });
  return [...new Set(origins)];
}

/**
 * The extent covering every one of `boxes`, with longitudes unwrapped so a union
 * straddling the antimeridian stays the short way round.
 *
 * Each box after the first is moved to whichever copy of the repeating world
 * sits nearest the first, the way `nearestWrappedX` picks a marker's nearest
 * copy. A trip to Fiji and Samoa spans about six degrees across the
 * antimeridian, and unioning the raw coordinates instead describes the 354
 * degrees of ocean going the other way round the planet - which fits at exactly
 * one zoom: the whole world, with both pins at opposite edges of it.
 *
 * `west` and `east` may come back outside [-180, 180]. That is the point: the
 * pair describes one interval, and both `fitBounds` below and MapLibre's
 * `Map.fitBounds` read it as one.
 *
 * **MapLibre does not do this for you, and checking it with two places will not
 * reveal that.** `LngLatBounds.extend()` unions with plain `Math.min`/`Math.max`
 * on raw longitude, and `Map.fitBounds` documents that the caller owns the
 * ordering. What rescues the two-place case is `cameraForBounds` calling
 * `adjustAntiMeridian()` on the *finished* box, which cannot see that the union
 * was built the long way round on the way there - so a two-point check passes
 * whether or not this function survived. Hence three places in its tests.
 *
 * It lives here rather than with the rest of the Web-Mercator arithmetic in
 * `lib/map-tiles.ts` because it outlives that module: the hand-rolled renderer
 * goes and this does not.
 */
export function unionBounds(boxes: LatLonBounds[]): LatLonBounds | null {
  if (boxes.length === 0) return null;

  let south = MAX_LATITUDE;
  let north = -MAX_LATITUDE;
  let west = Infinity;
  let east = -Infinity;
  // The first box's west edge, which every later box is unwrapped against.
  let reference = 0;

  boxes.forEach((box, index) => {
    // Min/max rather than trusting the order: this also renders form state on
    // its way to the API, so it meets boxes the API's validation has not seen.
    south = Math.min(south, clampLatitude(Math.min(box.south, box.north)));
    north = Math.max(north, clampLatitude(Math.max(box.south, box.north)));

    // The box's width taken as a signed span first, so the antimeridian case
    // (east folding back behind west) stays one interval instead of becoming a
    // negative one, while a genuinely zero-width point stays a point.
    const signed = box.east - box.west;
    const span = signed >= 0 ? Math.min(signed, 360) : signed + 360;
    let boxWest = wrapLongitude(box.west);

    if (index === 0) {
      reference = boxWest;
    } else {
      boxWest += Math.round((reference - boxWest) / 360) * 360;
    }
    west = Math.min(west, boxWest);
    east = Math.max(east, boxWest + span);
  });

  // Past a full turn there is no short way round left to preserve, and an extent
  // wider than the world is not one any camera can be asked to fit.
  if (east - west >= 360) {
    west = -180;
    east = 180;
  }

  return { south, north, west, east };
}
