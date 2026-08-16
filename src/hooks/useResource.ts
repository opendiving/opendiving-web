"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import {
  readResourceCache,
  resourceCacheGeneration,
  writeResourceCache,
} from "@/lib/resource-cache";

interface UseResourceOptions<T> {
  /** Hold off fetching until this is true (typically until `user` is known). */
  enabled?: boolean;
  /** Toast shown, and logged, when the fetch fails. */
  errorMessage: string;
  /** Where the diver is sent when the fetch fails - the resource's list page. */
  redirectTo: string;
  /**
   * Runs with each freshly loaded resource. For callers that seed something from
   * it, like the dive edit page's `form.reset`. Held in a ref, so an inline arrow
   * function - the obvious thing to write - doesn't restart the fetch.
   */
  onLoaded?: (resource: T) => void;
  /**
   * Opt into stale-while-revalidate. Pass a prefix naming the kind of thing
   * being fetched (`dive`, `gear`); the route's id is added to it. Stepping back
   * into a record seen recently then shows it immediately and refreshes behind
   * it, rather than standing the page in again.
   *
   * Omit it and the hook behaves exactly as it did before the cache existed.
   *
   * **Not for pages that seed a form from `onLoaded`.** A cache hit fires
   * `onLoaded` twice - once with the stale record, once with the fresh one - and
   * on the dive edit page the second call is a `form.reset` that would discard
   * anything typed in between. Read-only pages have no such window, which is why
   * `dives/[id]` opts in and `dives/[id]/edit` deliberately does not.
   */
  cacheKey?: string;
}

/**
 * Fetch-one-resource-by-route-param, for the `[id]` detail pages.
 *
 * The dives, sites, trips and gear detail pages plus the dive edit page each
 * hand-rolled the same block: read `params.id`, cast it to a string, fetch,
 * toast-and-redirect on failure, clear a loading flag in `finally`. They had
 * drifted in the usual small ways - some guarded against settling after unmount and
 * some didn't, so navigating away from a slow dive page still fired a toast and a
 * redirect on whatever page the diver had landed on.
 *
 * `params.id as string` lives here now too. The cast is unavoidable (Next types the
 * param as `string | string[]`, and only a catch-all route can produce the array),
 * but it is worth making once rather than five times.
 */
export function useResource<T>(
  fetchFn: (id: string) => Promise<T>,
  {
    enabled = true,
    errorMessage,
    redirectTo,
    onLoaded,
    cacheKey,
  }: UseResourceOptions<T>,
) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [resource, setResource] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // A `[id]` route always yields a single segment; the array case belongs to
  // catch-all routes, which none of these are.
  const id = params.id as string;

  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  // Re-reads the resource *without* touching `isLoading`, so a refresh after an
  // edit swaps the card that changed instead of blanking the page into a spinner.
  // A failure here is non-fatal - whatever prompted the refresh already succeeded -
  // so it doesn't redirect.
  const refetch = useCallback(async () => {
    if (!id) return;
    const atGeneration = resourceCacheGeneration();
    try {
      const data = await fetchFn(id);
      setResource(data);
      if (cacheKey) writeResourceCache(`${cacheKey}:${id}`, data, atGeneration);
      onLoadedRef.current?.(data);
    } catch (error) {
      console.error(errorMessage, error);
    }
  }, [id, fetchFn, errorMessage, cacheKey]);

  useEffect(() => {
    if (!enabled || !id) return;
    let cancelled = false;

    const key = cacheKey ? `${cacheKey}:${id}` : undefined;
    const cached = key ? readResourceCache<T>(key) : undefined;
    // Read before the request, checked on the write - see `resource-cache.ts`.
    const atGeneration = resourceCacheGeneration();

    const load = async () => {
      // A hit means the page has something to render, so this is a refresh and
      // `isLoading` stays false: the record shows immediately and is replaced
      // when the answer lands. `onLoaded` runs for it too, so a consumer that
      // derives display state from the record has it for the cached copy as well
      // as the fresh one - which is also why a consumer that seeds a *form* from
      // `onLoaded` must not pass `cacheKey` at all. See its JSDoc above.
      //
      // Read inside the effect rather than in the `useState` initialiser, so the
      // server's first render (where the cache is always empty) and the
      // browser's agree and hydration has nothing to reconcile.
      if (cached) {
        setResource(cached);
        setIsLoading(false);
        onLoadedRef.current?.(cached);
      }

      try {
        if (!cached) setIsLoading(true);
        const data = await fetchFn(id);
        if (cancelled) return;
        setResource(data);
        if (key) writeResourceCache(key, data, atGeneration);
        onLoadedRef.current?.(data);
      } catch (error) {
        console.error(errorMessage, error);
        // The guard matters most here: without it a request that outlives the page
        // toasts and redirects on top of wherever the diver went next.
        if (cancelled) return;
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        router.push(redirectTo);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [enabled, id, fetchFn, errorMessage, redirectTo, toast, router, cacheKey]);

  return { id, resource, setResource, isLoading, refetch };
}
