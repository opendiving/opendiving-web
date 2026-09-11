"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import type { PaginatedResponse } from "@/lib/api/client";

// Re-exported for the pages that import the type alongside this hook. The
// declaration itself lives in `lib/api/client.ts` - it describes the API's wire
// format, so having it here (a layer *above* `lib/api/`) is what pushed eight
// `lib/api/*` modules into each declaring their own copy.
export type { PaginatedResponse };

interface UseInfiniteResourceOptions<T> {
  itemsPerPage?: number;
  errorMessage?: string;
  /** Skip fetching until this becomes true (e.g. while waiting for `user`). */
  enabled?: boolean;
  /**
   * Identity of an item, used to dedup across pages and to address a row in
   * `removeItem`. Required rather than defaulted to `uuid`, because not every
   * resource has one - the admin invite queue is keyed by email. Held in a ref,
   * so passing an inline arrow - the obvious thing to write - doesn't restart
   * the fetch on every render.
   */
  keyOf: (item: T) => string;
}

/**
 * Shared fetch-on-mount + load-the-next-page logic for the list pages and the
 * cards that list a resource inside one. `fetchFn` should be a stable
 * (useCallback'd) function performing the actual API request for a given page,
 * typically closing over the current user.
 *
 * Pages accumulate rather than replace: `items` holds every page fetched so far,
 * which is what `LoadMoreTrigger` scrolls through. Pair the two.
 */
export function useInfiniteResource<T>(
  fetchFn: (page: number, perPage: number) => Promise<PaginatedResponse<T>>,
  {
    itemsPerPage = 10,
    errorMessage = "Failed to load data. Please try again.",
    enabled = true,
    keyOf,
  }: UseInfiniteResourceOptions<T>,
) {
  const { toast } = useToast();
  const keyOfRef = useRef(keyOf);
  useEffect(() => {
    keyOfRef.current = keyOf;
  });

  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Whether the last attempt failed, and the reason it is state the *trigger*
  // reads rather than something handled in here.
  //
  // A failed page leaves `hasMore` true and clears `isLoadingMore`, which is
  // indistinguishable from a page that succeeded - so an auto-loading trigger
  // sitting on screen re-fires the moment the spinner clears, and a list whose
  // API is down becomes an unbounded request loop at network speed. One
  // `destructive` toast per iteration, and with `TOAST_LIMIT = 1` that reads to
  // the diver as one error toast that never clears rather than as a storm.
  //
  // Latching here rather than inside `loadMore` is deliberate: a retry the diver
  // asked for must still go through, and `loadMore` is the one path both the
  // trigger and its button take. `LoadMoreTrigger` stops auto-firing while this
  // is set and turns its button into "Try again"; every attempt clears it.
  const [loadFailed, setLoadFailed] = useState(false);

  // `items` again, readable synchronously. Every mutation below is computed from
  // the previous list in an event or async callback, never during a render, so a
  // ref is the honest source for "what is on screen right now" - a functional
  // `setItems` updater could not also re-derive `nextPage` without doing work
  // inside an updater React is free to run twice.
  const itemsRef = useRef<T[]>([]);
  const commitItems = useCallback((next: T[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  // The page `loadMore` will ask for next. A ref, not state: nothing renders it,
  // and `loadMore` has to read the current value rather than one closed over at
  // the last render.
  const nextPage = useRef(1);

  // Set the moment a request starts rather than when React re-renders with the
  // flag below. The load-more trigger fires from an IntersectionObserver, which
  // can deliver two entries before a render lands in between - and the state
  // both `loadMore` and the trigger read would still say "idle" for the second.
  const isFetching = useRef(false);

  // Identifies the most recent request. A `fetchFn` that changes (a filter
  // toggled, a scoped id changing) restarts the list from page 1 while an
  // append may still be in flight, and the older one must not commit its rows
  // on top of the new list. Only the newest request is allowed to settle.
  const latestRequest = useRef(0);

  const load = useCallback(
    async (page: number, append: boolean) => {
      const requestId = latestRequest.current + 1;
      latestRequest.current = requestId;
      isFetching.current = true;

      try {
        setLoadFailed(false);
        if (append) setIsLoadingMore(true);
        else setIsLoading(true);

        const response = await fetchFn(page, itemsPerPage);
        if (latestRequest.current !== requestId) return;

        if (append) {
          // Deduped by identity, and load-bearing rather than belt-and-braces.
          // The API pages by offset, so anything inserted since an earlier page
          // was read shifts every later row down one and the boundary row
          // arrives a second time - a duplicate React key. `removeItem` relies
          // on this too: it rewinds `nextPage` to re-read the page a deletion
          // shifted, and every row but the newly-exposed one comes back a
          // repeat. `fetchAllPages` in `lib/api/client.ts` carries the same
          // dedup for the same reason, and records the half neither can fix - a
          // row pushed *out* of an already-read page by someone else's delete
          // leaves a gap.
          const identify = keyOfRef.current;
          const known = new Set(itemsRef.current.map(identify));
          commitItems([
            ...itemsRef.current,
            ...response.data.filter((item) => !known.has(identify(item))),
          ]);
        } else {
          commitItems(response.data);
        }

        setTotalCount(response.total_count);
        setHasMore(response.has_more);
        nextPage.current = page + 1;
      } catch (error) {
        if (latestRequest.current !== requestId) return;
        setLoadFailed(true);
        console.error(errorMessage, error);
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        // Superseded requests leave the spinners alone: the one that replaced
        // them is still running, and clearing them here would flash the list
        // back in mid-load.
        if (latestRequest.current === requestId) {
          isFetching.current = false;
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [fetchFn, itemsPerPage, toast, errorMessage, commitItems],
  );

  /** Discard every loaded page and read the list again from the first one. */
  const reload = useCallback(() => {
    nextPage.current = 1;
    return load(1, false);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!hasMore || isFetching.current) return;
    return load(nextPage.current, true);
  }, [hasMore, load]);

  /**
   * Drop one row without re-reading the pages around it.
   *
   * A delete that reset the list to page 1 would yank the ground out from under
   * a diver who had scrolled: everything above them would vanish and the page
   * would shrink mid-read. So the row goes locally and `nextPage` is re-derived
   * from what is left.
   *
   * That second half is what keeps a row from disappearing silently. Offsets
   * below the deleted row all shift up by one, so the next page boundary moves
   * with them; asking for the page after the last one fetched would skip
   * whichever row slid across it. Re-deriving asks for the page that now
   * *contains* the boundary instead, and the dedup above discards the rows
   * already on screen.
   */
  const removeItem = useCallback(
    (key: string) => {
      const identify = keyOfRef.current;
      const next = itemsRef.current.filter((item) => identify(item) !== key);
      if (next.length === itemsRef.current.length) return;

      commitItems(next);
      setTotalCount((count) => Math.max(0, count - 1));
      nextPage.current = Math.floor(next.length / itemsPerPage) + 1;
    },
    [itemsPerPage, commitItems],
  );

  /**
   * Take a freshly-saved row from a create/edit dialog.
   *
   * An edit swaps the row in place, which costs no request and - the point -
   * leaves a diver who had scrolled several pages in exactly where they were. A
   * create is not in the loaded window by definition, so there is nothing to
   * swap and it falls back to reading the list again. Where the new row then
   * lands is up to the ordering rather than to this: none of these lists is
   * newest-first, so a site named late in the alphabet or a trip dated years ago
   * is somewhere further down, and the reader scrolls to it like any other row.
   *
   * The cursor steps back a page for the same reason `removeItem` re-derives
   * it, and is re-derived rather than decremented for the same reason too.
   * Every list here is ordered by a column the edit dialog can change - dive
   * sites by name, trips and courses by start date, certifications by the date
   * certified - so a rename or a re-dated trip *moves* the row in the server's
   * order. Move it later than the loaded window and everything after its old
   * slot shifts up one offset, so asking for the page after the last one fetched
   * skips whichever row slid across the boundary, permanently. Re-reading the
   * previous page covers a shift of one row in either direction and the dedup in
   * `load` absorbs the repeats; the cost is one overlapping request on the next
   * scroll, however many edits it follows.
   *
   * That last part is why this is computed from what is loaded rather than
   * decremented. A decrement compounds, and the calls are not always one per
   * edit: the certifications page runs this on every card-image upload and
   * removal, so swapping both sides of a card fires it twice with no scroll in
   * between - and a change to a stored file cannot re-sort anything. Derived,
   * the answer is the same however many times it is asked.
   *
   * What it does not do is re-sort what is already on screen: the row keeps its
   * old position, with its new contents, until something reloads the list. That
   * is the deliberate half of the trade - putting the row where it now belongs
   * means reading the list again, which is exactly the jump this function exists
   * to avoid.
   */
  const applySaved = useCallback(
    (saved: T) => {
      const identify = keyOfRef.current;
      const key = identify(saved);
      const index = itemsRef.current.findIndex(
        (item) => identify(item) === key,
      );
      if (index === -1) return reload();

      const next = [...itemsRef.current];
      next[index] = saved;
      commitItems(next);
      nextPage.current = Math.max(1, Math.floor(next.length / itemsPerPage));
    },
    [commitItems, reload, itemsPerPage],
  );

  useEffect(() => {
    // Deliberate fetch-on-mount pattern (setIsLoading(true) runs synchronously
    // before the network await). This is a known, contentious false-positive for
    // react-hooks/set-state-in-effect - see https://github.com/facebook/react/issues/34743.
    if (enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      reload();
    }
  }, [enabled, reload]);

  return {
    items,
    isLoading,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    reload,
    removeItem,
    applySaved,
  };
}
