/**
 * A tiny in-memory cache of the last response for a given request, so revisiting
 * a page can paint the rows it showed last time and refetch behind them instead
 * of standing the whole list in again.
 *
 * It is deliberately not a data-fetching library. There is no request
 * deduplication, no subscription, no background polling and no fine-grained
 * invalidation - `usePaginatedResource`/`useResource` read it before they fetch
 * and write it after, and any mutation empties the whole thing (see
 * `lib/api/client.ts`). Everything it does not do is a thing that cannot go
 * subtly wrong.
 */

// Entries are dropped rather than served once they are this old. A revisit is
// normally seconds later; a tab left open over lunch should stand the page in
// again rather than flash figures from before the dives were logged. Beyond
// this the behaviour is exactly what it was before the cache existed.
const MAX_AGE_MS = 5 * 60 * 1000;

// Enough for a long browsing session - ten list pages and forty dives - without
// letting an afternoon of clicking grow the map without bound. The eviction
// order is least-recently-*read*, which `Map`'s insertion ordering gives for
// free as long as a read re-inserts.
const MAX_ENTRIES = 50;

interface CacheEntry {
  value: unknown;
  storedAt: number;
}

const entries = new Map<string, CacheEntry>();

// The module is imported by client components, which Next still renders on the
// server - and a module-level `Map` there is shared by every request the process
// handles, which is exactly the shape of an "I can see someone else's dives"
// bug. Reads and writes are both no-ops off the browser, so the server can never
// hold or hand out an entry. Nothing writes from the server today (writes only
// happen after a fetch in an effect), which is precisely why it is worth closing
// structurally rather than relying on that staying true.
const isBrowser = () => typeof window !== "undefined";

/**
 * The cached value for `key`, or `undefined` if there isn't a live one.
 *
 * `key` must namespace whatever it identifies (`dives:<user>:page:1`, not `1`).
 * The cast is unchecked - two callers agreeing on a key but not on a type would
 * hand one of them the other's shape - so keys are built by the hooks rather
 * than spelled out at call sites.
 */
export function readResourceCache<T>(key: string): T | undefined {
  if (!isBrowser()) return undefined;

  const entry = entries.get(key);
  if (!entry) return undefined;

  if (Date.now() - entry.storedAt > MAX_AGE_MS) {
    entries.delete(key);
    return undefined;
  }

  // Re-insert so this key is now the most recent, which is what makes the
  // eviction below least-recently-used rather than first-in-first-out.
  entries.delete(key);
  entries.set(key, entry);

  return entry.value as T;
}

/** Stores `value` under `key`, evicting the least recently read entry if full. */
export function writeResourceCache(key: string, value: unknown): void {
  if (!isBrowser()) return;

  entries.delete(key);
  entries.set(key, { value, storedAt: Date.now() });

  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/**
 * Empties the cache.
 *
 * Called on any non-GET response and whenever the signed-in user changes. Both
 * are blunt on purpose: a dive can appear in the dives list, a trip's dives, a
 * site's dives, a gear item's dives, the dashboard's stats and its own detail
 * page, so "invalidate what this write affected" is a dependency graph that has
 * to be right every time somebody adds an endpoint. Emptying the map costs one
 * refetch of whatever the diver looks at next - which is what would have
 * happened anyway before any of this - and cannot be wrong.
 */
export function clearResourceCache(): void {
  entries.clear();
}

/** The number of live entries. Exported for tests. */
export function resourceCacheSize(): number {
  return entries.size;
}
