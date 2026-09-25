/**
 * Everything an operator configures about this instance, read from the environment at
 * request time rather than baked into the bundle.
 *
 * `NEXT_PUBLIC_*` values are inlined by the compiler wherever they are written as a
 * literal, so anything read that way is frozen into a published image and cannot be
 * changed without rebuilding it. That is the same trap `lib/api-base.ts` describes for
 * the API's address, one layer up: a prebuilt image is only worth publishing if the
 * whole of its configuration survives being handed to somebody else. So this module runs
 * on the server, reads plain variables, and hands the browser's share of the answer to
 * `contexts/ConfigContext.tsx`.
 *
 * See `DECISIONS.md`, "Web config is read at runtime, and the browser is handed it".
 */

import { resolveBasemap, type Basemap } from "@/lib/basemap";

/**
 * The variables, as a plain bag of strings. Narrower than `NodeJS.ProcessEnv`, whose
 * required `NODE_ENV` a test would otherwise have to name to hand over three variables.
 */
type Environment = Record<string, string | undefined>;

/** Where metadata URLs resolve against when `SITE_URL` says nothing. */
export const DEFAULT_SITE_URL = "http://localhost:3000";

/** The part of the configuration the browser is given. */
export interface PublicConfig {
  /**
   * Google's OAuth client ID, or `undefined` to hide "Continue with Google" entirely.
   * Not a secret - it is meant to be seen by the browser - and it must match the API's
   * `GOOGLE_CLIENT_ID`.
   */
  googleClientId?: string;
  /**
   * The basemap every map draws, already resolved: a style URL pair or a raster
   * template pair, plus the credit rendered over whichever is active.
   *
   * One field, and it was briefly two. A `tiles` pair sat beside it for the one
   * change in which the site picker still drew its own `<img>` tiles and needed
   * a raster template in every configuration - including the default, where this
   * is a vector style and offers none. Both renderers are MapLibre now, so an
   * operator's `MAP_STYLE_URL` reaches every map rather than all but one.
   */
  basemap: Basemap;
}

/** `PublicConfig` plus the parts only the server renders with. */
export interface RuntimeConfig extends PublicConfig {
  /**
   * This instance's own origin. Only `metadataBase` and the OpenGraph URL use it, so a
   * wrong value costs link previews rather than anything functional.
   */
  siteUrl: string;
  /**
   * Shown on `/support` as a fallback when a submission fails. Display only - the API's
   * `CONTACT_FORM_EMAIL` is what actually routes mail - so it is deliberately unset by
   * default rather than pointing a self-hoster's visitors at this project's inbox.
   */
  contactEmail?: string;
  /**
   * Whether `src/proxy.ts` may send `Strict-Transport-Security`. On by default, and only
   * ever acted on for a request that already arrived over HTTPS; `WEB_HSTS=off` is the
   * escape hatch for an instance served over plain HTTP on a LAN, where a browser that
   * recorded the pin would refuse to reach it again.
   */
  hstsEnabled: boolean;
  /**
   * Whether to ask crawlers to stay out entirely - `app/robots.ts` plus an
   * `X-Robots-Tag` on every page. Off by default, which is what a public instance wants;
   * a private one sets `WEB_NOINDEX=true`.
   */
  noindex: boolean;
}

/**
 * A configured value, preferring the runtime name and falling back to the
 * `NEXT_PUBLIC_`-prefixed one that used to carry it.
 *
 * The fallback is reached through a *computed* key on purpose. Written as the literal
 * `process.env.NEXT_PUBLIC_X`, the compiler replaces the whole expression with whatever
 * the build machine had - and the published image is built with none of these set, so
 * the fallback would be frozen to `undefined` while still reading like it worked. A
 * computed key is left alone, which is what keeps a build-time-configured deployment
 * working after this module took over.
 *
 * Blank counts as unset at both levels. A compose file that names a variable it has no
 * value for (`GOOGLE_CLIENT_ID=`) has configured nothing, and reading that as "explicitly
 * empty" would suppress the fallback rather than fall through to it.
 */
function configured(env: Environment, name: string): string | undefined {
  return set(env[name]) ?? set(env[`NEXT_PUBLIC_${name}`]);
}

function set(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

/**
 * A boolean variable, with anything unrecognized falling back rather than counting as
 * one of the two answers. `WEB_NOINDEX=enabled` is somebody asking for it on, and
 * silently reading as off - or as on, which is worse - is not the way to tell them it
 * did nothing.
 */
function flag(
  name: string,
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  const normalized = value.toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  console.warn(
    `[runtime-config] Ignoring unrecognized ${name}=${value}. ` +
      `Use one of ${[...TRUE_VALUES].join("/")} or ${[...FALSE_VALUES].join("/")}; ` +
      `leaving it at ${fallback}.`,
  );
  return fallback;
}

/**
 * A validated absolute origin, or the localhost default.
 *
 * `metadataBase` is a `new URL(...)`, which throws on a malformed value - and it is
 * built in the root layout, so a typo'd `SITE_URL` would take every page down over
 * OpenGraph tags. Failing back to the default and saying so is the same trade
 * `lib/api-base.ts` and `lib/basemap.ts` make for the CSP.
 */
function resolveSiteUrl(value: string | undefined): string {
  if (!value) return DEFAULT_SITE_URL;
  try {
    const { protocol } = new URL(value);
    // As in `apiCspSource`: `new URL` only throws when there is no parseable scheme at
    // all, so "htp://example.com" would sail through and reach crawlers as an
    // unfetchable `og:url`.
    if (protocol !== "http:" && protocol !== "https:")
      throw new Error(protocol);
    return value;
  } catch {
    console.warn(
      `[runtime-config] Ignoring malformed SITE_URL: ${value}. ` +
        `Give an absolute origin such as https://dives.example.com; ` +
        `falling back to ${DEFAULT_SITE_URL}.`,
    );
    return DEFAULT_SITE_URL;
  }
}

/**
 * Reads a configuration out of a given environment.
 *
 * Exported for tests; everything else wants `runtimeConfig()`, which reads the real one
 * once. Warnings here are not gated on `NODE_ENV` for that reason - they are emitted
 * once per process, and a self-hoster who mistyped a variable is exactly who needs to
 * see them.
 */
export function readRuntimeConfig(
  env: Environment = process.env,
): RuntimeConfig {
  return {
    siteUrl: resolveSiteUrl(configured(env, "SITE_URL")),
    contactEmail: configured(env, "CONTACT_EMAIL"),
    googleClientId: configured(env, "GOOGLE_CLIENT_ID"),
    // `MAP_ATTRIBUTION` belongs to neither mode, which is why it lost the
    // `MAP_TILE_` prefix: it is one credit, applying to whichever basemap is
    // active, and an operator who configures a vector style must be able to set
    // it. Left inside the raster group - where it used to be - a style could be
    // configured with no way to credit it, and the app would render the bundled
    // pair's OpenMapTiles credit over somebody else's tiles: false, and a
    // licence breach for any style that is not OpenFreeMap's.
    basemap: resolveBasemap({
      styleUrl: configured(env, "MAP_STYLE_URL"),
      styleUrlDark: configured(env, "MAP_STYLE_URL_DARK"),
      tileUrl: configured(env, "MAP_TILE_URL"),
      tileUrlDark: configured(env, "MAP_TILE_URL_DARK"),
      attribution: configured(env, "MAP_ATTRIBUTION"),
      apiKey: configured(env, "MAP_TILE_API_KEY"),
    }),
    // Read directly rather than through `configured`: these two are new names with no
    // `NEXT_PUBLIC_` past to fall back to, and offering one would invite an operator to
    // set a variable that reaches the browser for a decision the server makes alone.
    hstsEnabled: flag("WEB_HSTS", set(env.WEB_HSTS), true),
    noindex: flag("WEB_NOINDEX", set(env.WEB_NOINDEX), false),
  };
}

let cached: RuntimeConfig | undefined;

/**
 * The configuration this process is running with.
 *
 * Read on first use rather than at module load - which would be a build-time read for
 * anything the compiler decides to evaluate early - and then kept, because the
 * environment cannot change while the process lives and the diagnostics above should be
 * said once rather than on every request.
 */
export function runtimeConfig(): RuntimeConfig {
  return (cached ??= readRuntimeConfig());
}

/**
 * The subset handed to the browser through `ConfigProvider`.
 *
 * Built field by field rather than by deleting the rest: what reaches the client is
 * worth being able to read off one expression, and a future server-only value should
 * have to be added here deliberately before it ships to anyone.
 */
export function publicConfig(
  config: RuntimeConfig = runtimeConfig(),
): PublicConfig {
  return {
    googleClientId: config.googleClientId,
    basemap: config.basemap,
  };
}
