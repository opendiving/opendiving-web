// Everything a picture fetches - tiles, glyphs, sprites, a remote style - and the
// bounded cache that keeps a second picture of the same coast off the network.
//
// Requests to the basemap carry the headers the instance's own pages send when a
// browser fetches the same tiles - `Origin` and `Referer` naming its `SITE_URL` -
// so a keyed provider restricted to the instance's domain accepts this as it
// accepts the browser, and a User-Agent saying what is asking.

import { readFile } from "node:fs/promises";
import path from "node:path";

export const USER_AGENT =
  "OpenDiving-MapRenderer (+https://github.com/opendiving/opendiving-web)";

// What a picture of one place costs, a few times over: the vendored basemap's
// glyph ranges, sprite and underlay are shared by every picture, and the vector
// tiles of a place are a few hundred kilobytes.
export const CACHE_BYTES = 32 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
// Larger than any tile, glyph range or sprite sheet; a provider sending more is
// broken, and holding it would be the cache's whole budget.
const MAX_RESOURCE_BYTES = 16 * 1024 * 1024;

/**
 * A resource that could not be had. Fails the whole render, which is the point:
 * a picture missing its tiles would be stored and shown for weeks.
 */
export class ResourceError extends Error {}

export interface ResourceOptions {
  /** This instance's own origin, which a relative URL resolves against. */
  siteUrl: string;
  /** The image's `public/`, which `${SITE_URL}/basemap/…` is read from. */
  publicDir: string;
  cacheBytes?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface Resources {
  /**
   * The bytes at `url`, or `null` for no content - a 404 or a 204, which is how
   * a provider says a tile is empty. A kept answer is reused until the cache
   * needs its room, or for `maxAgeMs` where that is given.
   */
  get(url: string, options?: { maxAgeMs?: number }): Promise<Buffer | null>;
}

interface Entry {
  data: Buffer | null;
  size: number;
  expiresAt: number;
}

// What a log line may say about a URL: never its query, which is where a keyed
// provider's credential lives.
export function describe(url: string): string {
  try {
    const { protocol, origin, pathname } = new URL(url);
    return protocol === "data:" ? "a data: URL" : `${origin}${pathname}`;
  } catch {
    return "a malformed URL";
  }
}

export function createResources({
  siteUrl,
  publicDir,
  cacheBytes = CACHE_BYTES,
  timeoutMs = REQUEST_TIMEOUT_MS,
  fetch: fetchImpl = fetch,
}: ResourceOptions): Resources {
  const site = new URL(siteUrl);
  const headers = {
    Origin: site.origin,
    // What `Referrer-Policy: strict-origin-when-cross-origin` lets a page send
    // to another origin: the origin alone.
    Referer: `${site.origin}/`,
    "User-Agent": USER_AGENT,
  };
  const basemapDir = path.resolve(publicDir, "basemap");

  // Insertion order is recency: a hit is moved to the end, eviction takes the
  // front.
  const cache = new Map<string, Entry>();
  let cachedBytes = 0;
  const inFlight = new Map<string, Promise<Buffer | null>>();

  function remember(key: string, data: Buffer | null, maxAgeMs?: number) {
    const size = (data?.length ?? 0) + key.length;
    if (size > cacheBytes) return;
    forget(key);
    cache.set(key, {
      data,
      size,
      expiresAt: maxAgeMs === undefined ? Infinity : Date.now() + maxAgeMs,
    });
    cachedBytes += size;
    for (const [oldest, entry] of cache) {
      if (cachedBytes <= cacheBytes) break;
      cache.delete(oldest);
      cachedBytes -= entry.size;
    }
  }

  function forget(key: string) {
    const entry = cache.get(key);
    if (!entry) return;
    cache.delete(key);
    cachedBytes -= entry.size;
  }

  // The vendored styles' sprite, named against this instance's own origin as
  // the browser names it, is read from the files the web serves it from.
  async function readLocal(pathname: string): Promise<Buffer | null> {
    const file = path.resolve(
      basemapDir,
      ...decodeURIComponent(pathname.slice("/basemap/".length)).split("/"),
    );
    if (!file.startsWith(basemapDir + path.sep)) return null;
    try {
      return await readFile(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async function fetchRemote(url: URL): Promise<Buffer | null> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: url.protocol === "data:" ? undefined : headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ResourceError(
        `Could not fetch ${describe(url.href)}: ${(error as Error).message}`,
      );
    }
    if (response.status === 204 || response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ResourceError(
        `${response.status} ${response.statusText} from ${describe(url.href)}`,
      );
    }
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > MAX_RESOURCE_BYTES) {
      throw new ResourceError(
        `${describe(url.href)} sent ${data.length} bytes, past the limit`,
      );
    }
    return data;
  }

  async function load(key: string): Promise<Buffer | null> {
    let url: URL;
    try {
      url = new URL(key, site);
    } catch {
      throw new ResourceError(`Cannot request ${describe(key)}`);
    }
    if (url.origin === site.origin && url.pathname.startsWith("/basemap/")) {
      return readLocal(url.pathname);
    }
    if (!["http:", "https:", "data:"].includes(url.protocol)) {
      throw new ResourceError(`Cannot request ${describe(key)}`);
    }
    return fetchRemote(url);
  }

  return {
    get(key, { maxAgeMs } = {}) {
      const kept = cache.get(key);
      if (kept && kept.expiresAt > Date.now()) {
        cache.delete(key);
        cache.set(key, kept);
        return Promise.resolve(kept.data);
      }
      const pending = inFlight.get(key);
      if (pending) return pending;

      const request = load(key)
        .then((data) => {
          remember(key, data, maxAgeMs);
          return data;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, request);
      return request;
    },
  };
}
