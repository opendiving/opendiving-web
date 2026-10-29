// Everything a render fetches - source tiles, glyphs, sprites, a remote style -
// and the bounded cache that keeps the next tile of the same coast off the
// network.
//
// Only from the origins the browser may fetch the same basemap from: this
// instance's own and those `basemapOrigins` names for the CSP's `connect-src`.
// The URLs come from documents the basemap host serves - a style, TileJSON's
// `tiles`, a redirect - so without that list a host that turned hostile could
// point the renderer at anything on its network.
//
// Requests to the basemap carry the headers the instance's own pages send when a
// browser fetches the same tiles - `Origin` and `Referer` naming its `SITE_URL` -
// so a keyed provider restricted to the instance's domain accepts this as it
// accepts the browser, and a User-Agent saying what is asking.

import { readFile } from "node:fs/promises";
import path from "node:path";

export const USER_AGENT =
  "OpenDiving-MapRenderer (+https://github.com/opendiving/opendiving-web)";

// What a coast's worth of tiles costs, a few times over: the vendored basemap's
// glyph ranges, sprite and underlay are shared by every tile, and a vector tile
// is a few hundred kilobytes at most.
export const CACHE_BYTES = 32 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
// Larger than any tile, glyph range or sprite sheet; a provider sending more is
// broken, and holding it would be the cache's whole budget. Counted as the body
// arrives, so a body that never ends costs this much memory and no more.
const MAX_RESOURCE_BYTES = 16 * 1024 * 1024;
// Each hop is checked against the origins like the first request.
const MAX_REDIRECTS = 5;

/**
 * A resource that could not be had. Fails the whole render, which is the point:
 * a tile drawn without its source tile would be stored and shown for weeks.
 */
export class ResourceError extends Error {}

export interface ResourceOptions {
  /** This instance's own origin, which a relative URL resolves against. */
  siteUrl: string;
  /** The image's `public/`, which `${SITE_URL}/basemap/…` is read from. */
  publicDir: string;
  /** The basemap's origins, as `basemapOrigins` derives them for the CSP. */
  origins: string[];
  cacheBytes?: number;
  timeoutMs?: number;
  maxBytes?: number;
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
  origins,
  cacheBytes = CACHE_BYTES,
  timeoutMs = REQUEST_TIMEOUT_MS,
  maxBytes = MAX_RESOURCE_BYTES,
  fetch: fetchImpl = fetch,
}: ResourceOptions): Resources {
  const site = new URL(siteUrl);
  const allowed = new Set([site.origin, ...origins]);
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

  function isAllowed(url: URL): boolean {
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      allowed.has(url.origin)
    );
  }

  // Redirects are followed by hand, so every hop answers to the same list as
  // the first request rather than `fetch` going wherever it is told.
  async function fetchRemote(start: URL): Promise<Buffer | null> {
    const signal = AbortSignal.timeout(timeoutMs);
    let url = start;
    for (let hops = 0; ; hops++) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: url.protocol === "data:" ? undefined : headers,
          redirect: "manual",
          signal,
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
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          throw new ResourceError(
            `${describe(url.href)} redirected to a malformed URL`,
          );
        }
        if (!isAllowed(next)) {
          throw new ResourceError(
            `${describe(url.href)} redirected to ${describe(next.href)}, ` +
              `which is not one of the basemap's origins`,
          );
        }
        if (hops === MAX_REDIRECTS) {
          throw new ResourceError(
            `Too many redirects from ${describe(start.href)}`,
          );
        }
        url = next;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ResourceError(
          `${response.status} ${response.statusText} from ${describe(url.href)}`,
        );
      }
      return readBody(url, response);
    }
  }

  async function readBody(url: URL, response: Response): Promise<Buffer> {
    const tooLarge = () =>
      new ResourceError(
        `${describe(url.href)} sent more than ${maxBytes} bytes`,
      );
    // `Number(null)` is 0 and a garbled value is NaN, both of which pass and
    // are counted below instead.
    if (Number(response.headers.get("content-length")) > maxBytes) {
      await response.body?.cancel();
      throw tooLarge();
    }
    if (!response.body) return Buffer.alloc(0);

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        throw new ResourceError(
          `Could not read ${describe(url.href)}: ${(error as Error).message}`,
        );
      }
      if (chunk.done) return Buffer.concat(chunks, total);
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(chunk.value);
    }
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
    if (url.protocol === "data:") return fetchRemote(url);
    if (!isAllowed(url)) {
      throw new ResourceError(
        `Cannot request ${describe(key)}, which is not on this instance or ` +
          `one of the basemap's origins`,
      );
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
