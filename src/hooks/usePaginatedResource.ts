"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import {
  readResourceCache,
  resourceCacheGeneration,
  writeResourceCache,
} from "@/lib/resource-cache";
import type { PaginatedResponse } from "@/lib/api/client";

// Re-exported for the pages that import the type alongside this hook. The
// declaration itself now lives in `lib/api/client.ts` - it describes the API's
// wire format, so having it here (a layer *above* `lib/api/`) is what pushed
// eight `lib/api/*` modules into each declaring their own copy.
export type { PaginatedResponse };

interface UsePaginatedResourceOptions {
  itemsPerPage?: number;
  errorMessage?: string;
  /** Skip fetching until this becomes true (e.g. while waiting for `user`). */
  enabled?: boolean;
  /**
   * Opt into stale-while-revalidate. Pass a prefix identifying *whose* list of
   * *what* this is - `dives:<user uuid>` - and the page and page size are added
   * to it. Revisiting then paints the rows this page last showed and refetches
   * behind them instead of standing the table in again.
   *
   * **The key has to cover every input `fetchFn` closes over.** The hook adds
   * the page and the page size because it knows about those; it cannot see a
   * filter, a search term or a sort order, and two result sets sharing one entry
   * means one of them gets painted under the other's controls. `/gear` puts its
   * `showArchived` toggle in the key for exactly this reason - the next filter
   * added anywhere has to do the same.
   *
   * Omit it and the hook behaves exactly as it did before the cache existed,
   * which is what `DiveNumberingStatus` and anything else short-lived wants.
   */
  cacheKey?: string;
}

// The page and page size both belong in the key: page 2 is not page 1, and the
// same page number under a different `itemsPerPage` is a different set of rows.
function pageCacheKey(cacheKey: string, page: number, perPage: number): string {
  return `${cacheKey}:page:${page}:per:${perPage}`;
}

/**
 * Shared pagination + fetch-on-mount logic for the dives/trips/sites list
 * pages (and any other page listing a paginated resource). `fetchFn` should
 * be a stable (useCallback'd) function performing the actual API request for
 * a given page, typically closing over the current user.
 */
export function usePaginatedResource<T>(
  fetchFn: (page: number, perPage: number) => Promise<PaginatedResponse<T>>,
  {
    itemsPerPage = 10,
    errorMessage = "Failed to load data. Please try again.",
    enabled = true,
    cacheKey,
  }: UsePaginatedResourceOptions = {},
) {
  const { toast } = useToast();
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Identifies the most recent request. Clicking through pages faster than the
  // network answers means several are in flight at once, and they can land out of
  // order - an earlier page's slower response would then overwrite the newer one's
  // rows *and* set `currentPage` back to its own number, leaving the footer saying
  // "page 3" over page 2's rows. Only the newest request is allowed to settle.
  const latestRequest = useRef(0);

  // One place that turns a response into the four pieces of state it sets, so
  // the cached copy and the fresh one can't drift into setting different ones.
  const applyPage = useCallback(
    (response: PaginatedResponse<T>, page: number) => {
      setItems(response.data);
      setTotalCount(response.total_count);
      setHasMore(response.has_more);
      setCurrentPage(page);
    },
    [],
  );

  const fetchPage = useCallback(
    async (page: number = 1) => {
      const requestId = latestRequest.current + 1;
      latestRequest.current = requestId;

      const key = cacheKey && pageCacheKey(cacheKey, page, itemsPerPage);
      const cached = key
        ? readResourceCache<PaginatedResponse<T>>(key)
        : undefined;
      // Read before the request, checked on the write: a mutation landing while
      // this one is in flight invalidates the answer it is about to bring back.
      const atGeneration = resourceCacheGeneration();

      // A hit means there is something to show, so this is a refresh rather than
      // a load and `isLoading` stays false - the table keeps the rows it had and
      // swaps them when the answer arrives. On a miss it is a load like any other.
      //
      // Deliberately read here rather than in the `useState` initialisers: the
      // hook would then have to produce different first renders on the server
      // (where the cache is always empty) and in the browser, which is a
      // hydration mismatch. Costing one frame of `isLoading` is free in practice,
      // because the skeleton it drives is transparent for its first 150ms.
      if (cached) {
        applyPage(cached, page);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }

      try {
        const response = await fetchFn(page, itemsPerPage);
        if (latestRequest.current !== requestId) return;

        applyPage(response, page);
        if (key) writeResourceCache(key, response, atGeneration);
      } catch (error) {
        if (latestRequest.current !== requestId) return;
        console.error(errorMessage, error);
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        // Superseded requests leave the spinner alone: the one that replaced them is
        // still running, and clearing it here would flash the list back in mid-load.
        if (latestRequest.current === requestId) setIsLoading(false);
      }
    },
    [fetchFn, itemsPerPage, toast, errorMessage, cacheKey, applyPage],
  );

  useEffect(() => {
    // Deliberate fetch-on-mount pattern (setIsLoading(true) runs synchronously
    // before the network await). This is a known, contentious false-positive for
    // react-hooks/set-state-in-effect - see https://github.com/facebook/react/issues/34743.
    if (enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchPage();
    }
  }, [enabled, fetchPage]);

  const refetch = useCallback(
    () => fetchPage(currentPage),
    [fetchPage, currentPage],
  );

  return {
    items,
    isLoading,
    totalCount,
    currentPage,
    itemsPerPage,
    hasMore,
    fetchPage,
    refetch,
  };
}
