/**
 * Where the browser sends API calls, and what the CSP has to allow as a result.
 *
 * The default is *relative* - `/api/v1` on whatever origin served the page - which the
 * catch-all route handler at `app/api/v1/[...path]/route.ts` forwards to the API
 * container. That is what lets one prebuilt image run on any domain: nothing about the
 * API's address is baked into the bundle. `NEXT_PUBLIC_API_URL` remains a build-time
 * override for split-origin deployments, and for local dev, where `.env` points straight
 * at `http://localhost:8000/api/v1` and the route handler is never reached.
 */

/**
 * The API base when `NEXT_PUBLIC_API_URL` is unset: same-origin, via the proxy route.
 *
 * It carries the `/api/v1` prefix for the same reason the absolute form does - every
 * `lib/api/*` module appends a route-relative path to it - and the route handler is
 * mounted at exactly that path, so the two cannot drift.
 */
export const DEFAULT_API_BASE_URL = "/api/v1";

/**
 * The base every API URL is built from, `/api/v1` prefix included - the override when
 * one is configured, the relative default otherwise.
 *
 * `lib/api/client.ts` sets axios' `baseURL` from this, and axios is what appends the
 * route-relative path for every call that goes through it. This constant exists for the
 * calls that *cannot*: an `<img src>` carries no `Authorization` header and never touches
 * the client, so a species photo's URL has to be composed by hand. Composing it against
 * a literal `/api/v1` instead would work in the shipped same-origin topology and silently
 * point at the wrong origin in a split-origin build - which is the topology local dev
 * runs, `.env` setting `NEXT_PUBLIC_API_URL` to `http://localhost:8000/api/v1`.
 *
 * `process.env.NEXT_PUBLIC_API_URL` is inlined by the compiler at build time, so this is
 * a literal in the bundle rather than a runtime read - the same reason `AGENTS.md` says
 * every *other* setting goes through `lib/runtime-config.ts` instead.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE_URL;

/**
 * The CSP source expression for the API, or `null` when it is same-origin.
 *
 * `null` means "`'self'` already covers it": both `connect-src` and `img-src` list
 * `'self'` unconditionally, so a relative base needs no entry of its own. An absolute
 * base is reduced to its *origin*, because a CSP source carrying a path matches that
 * exact path and nothing under it - `http://localhost:8000/api/v1` as a source would
 * allow a request to `/api/v1` alone and block every real call.
 *
 * Malformed values fail closed, for the same reason `basemapOrigins` does: this runs in
 * middleware on every request, so a typo'd variable must not take the site down. The
 * cost is that the API is then blocked by a CSP that simply never named it, which the
 * console message exists to explain.
 */
export function apiCspSource(base: string | undefined): string | null {
  const value = base?.trim();
  if (!value) return null;
  // The shipped default and anything else same-origin. Checked before `new URL`, which
  // throws on a bare path - the reason this function exists at all.
  if (value.startsWith("/")) return null;

  try {
    const { origin, protocol } = new URL(value);
    // `new URL` only throws when there is no parseable scheme at all. A typo like
    // "htp://" parses happily as a non-special scheme and yields the opaque origin
    // "null", which reaches the CSP as the literal token `null` - discarded by browsers
    // as an invalid source with nothing said about why.
    if (protocol !== "http:" && protocol !== "https:")
      throw new Error(protocol);
    return origin;
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[api-base] Ignoring malformed NEXT_PUBLIC_API_URL: ${value}. ` +
          "Give an absolute URL including the /api/v1 prefix, or leave it unset " +
          "to call the API through this app's own /api/v1 proxy route.",
      );
    }
    return null;
  }
}
