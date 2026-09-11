import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInfiniteResource } from "./useInfiniteResource";
import type { PaginatedResponse } from "@/lib/api/client";

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

type Row = { uuid: string };

const keyOf = (row: Row) => row.uuid;

// The rows a page-by-offset API would answer with, over a stable list of
// `total` items named `r0`, `r1`, ... - so a test can delete from the middle and
// assert on which row the *next* page starts at.
function ledger(total = 30, perPage = 10) {
  let rows = Array.from({ length: total }, (_, i) => ({ uuid: `r${i}` }));

  const fetchFn = vi.fn(
    async (page: number, size: number): Promise<PaginatedResponse<Row>> => {
      const start = (page - 1) * size;
      return {
        data: rows.slice(start, start + size),
        total_count: rows.length,
        has_more: start + size < rows.length,
        page,
        items_per_page: size,
      };
    },
  );

  return {
    fetchFn,
    perPage,
    /** Simulates another writer removing a row the list has already read. */
    dropServerSide: (uuid: string) => {
      rows = rows.filter((row) => row.uuid !== uuid);
    },
  };
}

function page(
  n: number,
  { total = 30, perPage = 10 } = {},
): PaginatedResponse<Row> {
  return {
    data: Array.from({ length: perPage }, (_, i) => ({ uuid: `p${n}-${i}` })),
    total_count: total,
    has_more: n * perPage < total,
    page: n,
    items_per_page: perPage,
  };
}

// A fetcher whose responses are resolved by hand, so a slow earlier request can
// be made to land *after* a fast later one - which is the whole point of the
// race tests.
function deferredFetcher() {
  const pending: { page: number; resolve: (v: unknown) => void }[] = [];
  const fetchFn = vi.fn(
    (p: number) =>
      new Promise<PaginatedResponse<Row>>((resolve) => {
        pending.push({ page: p, resolve: resolve as (v: unknown) => void });
      }),
  );
  return { fetchFn, pending };
}

beforeEach(() => {
  toast.mockClear();
});

describe("useInfiniteResource", () => {
  it("fetches the first page on mount", async () => {
    const { fetchFn } = ledger();
    const { result } = renderHook(() =>
      useInfiniteResource(fetchFn, { keyOf }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchFn).toHaveBeenCalledWith(1, 10);
    expect(result.current.totalCount).toBe(30);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.items).toHaveLength(10);
  });

  it("appends the next page instead of replacing the list", async () => {
    const { fetchFn } = ledger();
    const { result } = renderHook(() =>
      useInfiniteResource(fetchFn, { keyOf }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.loadMore());

    expect(fetchFn).toHaveBeenLastCalledWith(2, 10);
    expect(result.current.items).toHaveLength(20);
    expect(result.current.items[0].uuid).toBe("r0");
    expect(result.current.items[19].uuid).toBe("r19");
    expect(result.current.hasMore).toBe(true);
  });

  it("stops at the end of the list", async () => {
    const { fetchFn } = ledger(25);
    const { result } = renderHook(() =>
      useInfiniteResource(fetchFn, { keyOf }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.loadMore());
    await act(() => result.current.loadMore());

    expect(result.current.items).toHaveLength(25);
    expect(result.current.hasMore).toBe(false);

    fetchFn.mockClear();
    await act(() => result.current.loadMore());
    expect(fetchFn).not.toHaveBeenCalled();
  });

  // The trigger is driven by an IntersectionObserver, which can deliver two
  // entries before a render lands in between - so the guard cannot be state.
  it("ignores a second loadMore while the first is still in flight", async () => {
    const { fetchFn, pending } = deferredFetcher();
    const { result } = renderHook(() =>
      useInfiniteResource(fetchFn, { keyOf }),
    );

    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => {
      pending[0].resolve(page(1));
    });

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  // An insert elsewhere shifts every later row down one, so the boundary row is
  // fetched twice. Two rows with the same React key is the visible half.
  it("dedupes a row that arrives on two pages", async () => {
    const fetchFn = vi.fn(
      async (p: number): Promise<PaginatedResponse<Row>> => ({
        data:
          p === 1
            ? [{ uuid: "a" }, { uuid: "b" }]
            : [{ uuid: "b" }, { uuid: "c" }],
        total_count: 4,
        has_more: p === 1,
        page: p,
        items_per_page: 2,
      }),
    );
    const { result } = renderHook(() =>
      useInfiniteResource(fetchFn, { keyOf, itemsPerPage: 2 }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.loadMore());

    expect(result.current.items.map(keyOf)).toEqual(["a", "b", "c"]);
  });

  describe("removeItem", () => {
    it("drops the row and the count without re-reading", async () => {
      const { fetchFn } = ledger();
      const { result } = renderHook(() =>
        useInfiniteResource(fetchFn, { keyOf }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      fetchFn.mockClear();
      act(() => result.current.removeItem("r3"));

      expect(fetchFn).not.toHaveBeenCalled();
      expect(result.current.items.map(keyOf)).not.toContain("r3");
      expect(result.current.totalCount).toBe(29);
    });

    // The bug this guards: offsets below the deleted row shift up by one, so
    // asking for the page after the last one fetched skips whichever row slid
    // across the boundary. Here that row is `r30` - deleting `r3` out of three
    // loaded pages moves it into the window, and a naive "next page is 4" would
    // start at `r31` and lose it for good.
    it("re-reads the page a deletion shifted, rather than skipping a row", async () => {
      const { fetchFn, dropServerSide } = ledger(40);
      const { result } = renderHook(() =>
        useInfiniteResource(fetchFn, { keyOf }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(() => result.current.loadMore());
      await act(() => result.current.loadMore());
      expect(result.current.items).toHaveLength(30);

      dropServerSide("r3");
      act(() => result.current.removeItem("r3"));
      await act(() => result.current.loadMore());

      expect(fetchFn).toHaveBeenLastCalledWith(3, 10);
      expect(result.current.items.map(keyOf)).toContain("r30");
      // And nothing arrived twice on the way.
      expect(new Set(result.current.items.map(keyOf)).size).toBe(
        result.current.items.length,
      );
    });

    it("ignores a key that is not on screen", async () => {
      const { fetchFn } = ledger();
      const { result } = renderHook(() =>
        useInfiniteResource(fetchFn, { keyOf }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      act(() => result.current.removeItem("nobody"));

      expect(result.current.items).toHaveLength(10);
      expect(result.current.totalCount).toBe(30);
    });
  });

  describe("applySaved", () => {
    it("swaps an edited row in place, with no request", async () => {
      const { fetchFn } = ledger();
      const { result } = renderHook(() =>
        useInfiniteResource<Row & { name?: string }>(fetchFn, { keyOf }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(() => result.current.loadMore());
      fetchFn.mockClear();
      act(() => result.current.applySaved({ uuid: "r15", name: "renamed" }));

      expect(fetchFn).not.toHaveBeenCalled();
      expect(result.current.items).toHaveLength(20);
      expect(result.current.items[15]).toEqual({
        uuid: "r15",
        name: "renamed",
      });
    });

    it("reads the list again for a row it has never seen", async () => {
      const { fetchFn } = ledger();
      const { result } = renderHook(() =>
        useInfiniteResource(fetchFn, { keyOf }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(() => result.current.loadMore());
      expect(result.current.items).toHaveLength(20);

      fetchFn.mockClear();
      await act(() => result.current.applySaved({ uuid: "brand-new" }));

      expect(fetchFn).toHaveBeenCalledWith(1, 10);
      expect(result.current.items).toHaveLength(10);
    });
  });

  it("discards the accumulated pages on reload", async () => {
    const { fetchFn } = ledger();
    const { result } = renderHook(() =>
      useInfiniteResource(fetchFn, { keyOf }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.loadMore());
    await act(() => result.current.reload());

    expect(result.current.items).toHaveLength(10);
    expect(fetchFn).toHaveBeenLastCalledWith(1, 10);
  });

  // The bug: a filter toggled mid-append would let the older request commit its
  // rows on top of the new list.
  it("ignores a superseded response that lands late", async () => {
    const { fetchFn, pending } = deferredFetcher();
    const { result } = renderHook(() =>
      useInfiniteResource(fetchFn, { keyOf }),
    );

    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => void result.current.reload());
    await waitFor(() => expect(pending).toHaveLength(2));

    await act(async () => {
      pending[1].resolve(page(2));
      pending[0].resolve(page(1));
    });

    expect(result.current.items[0].uuid).toBe("p2-0");
  });

  it("leaves the spinner up while a newer request is still running", async () => {
    const { fetchFn, pending } = deferredFetcher();
    const { result } = renderHook(() =>
      useInfiniteResource(fetchFn, { keyOf }),
    );

    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => void result.current.reload());
    await waitFor(() => expect(pending).toHaveLength(2));

    await act(async () => {
      pending[0].resolve(page(1));
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      pending[1].resolve(page(1));
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("does not toast for a superseded request that fails", async () => {
    const { fetchFn, pending } = deferredFetcher();
    const { result } = renderHook(() =>
      useInfiniteResource(fetchFn, { keyOf }),
    );

    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => void result.current.reload());
    await waitFor(() => expect(pending).toHaveLength(2));

    const failFirst = fetchFn.mock.results[0].value as Promise<unknown>;
    failFirst.catch(() => {});
    await act(async () => {
      pending[1].resolve(page(1));
    });

    expect(toast).not.toHaveBeenCalled();
  });

  it("toasts when the current request fails", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("500"));
    const { result } = renderHook(() =>
      useInfiniteResource(fetchFn, {
        keyOf,
        errorMessage: "Failed to load dives.",
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Failed to load dives.",
        variant: "destructive",
      }),
    );
  });

  // The flag the trigger reads to stop auto-loading. A failed page leaves
  // `hasMore` true and clears the spinner - indistinguishable from a page that
  // landed - so without this the list would re-request at network speed for as
  // long as the trigger stayed on screen.
  describe("loadFailed", () => {
    it("is raised by a failed page and cleared by the next attempt", async () => {
      let failNext = false;
      const { fetchFn } = ledger();
      const flaky = vi.fn(async (page: number, size: number) => {
        if (failNext) throw new Error("500");
        return fetchFn(page, size);
      });
      const { result } = renderHook(() =>
        useInfiniteResource(flaky, { keyOf }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.loadFailed).toBe(false);

      failNext = true;
      await act(() => result.current.loadMore());

      expect(result.current.loadFailed).toBe(true);
      // Untouched, which is exactly why the latch has to exist.
      expect(result.current.hasMore).toBe(true);
      expect(result.current.isLoadingMore).toBe(false);
      expect(result.current.items).toHaveLength(10);

      failNext = false;
      await act(() => result.current.loadMore());

      expect(result.current.loadFailed).toBe(false);
      expect(result.current.items).toHaveLength(20);
    });

    // The retry must not skip the page that failed - `nextPage` is only
    // advanced by a response that actually arrived.
    it("re-requests the page that failed, not the one after it", async () => {
      let failNext = false;
      const { fetchFn } = ledger();
      const flaky = vi.fn(async (page: number, size: number) => {
        if (failNext) throw new Error("500");
        return fetchFn(page, size);
      });
      const { result } = renderHook(() =>
        useInfiniteResource(flaky, { keyOf }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      failNext = true;
      await act(() => result.current.loadMore());
      failNext = false;
      await act(() => result.current.loadMore());

      expect(flaky.mock.calls.map(([page]) => page)).toEqual([1, 2, 2]);
      expect(result.current.items.map(keyOf)).toContain("r10");
    });
  });

  it("waits for `enabled` before fetching", async () => {
    const { fetchFn } = ledger();
    const { rerender } = renderHook(
      ({ enabled }) => useInfiniteResource(fetchFn, { keyOf, enabled }),
      { initialProps: { enabled: false } },
    );

    expect(fetchFn).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
  });

  // `keyOf` is held in a ref for this: an inline arrow is the obvious thing to
  // write at a call site, and a new identity every render would otherwise
  // restart the fetch on each one.
  it("does not refetch when `keyOf` is a fresh arrow each render", async () => {
    const { fetchFn } = ledger();
    const { rerender } = renderHook(() =>
      useInfiniteResource(fetchFn, { keyOf: (row: Row) => row.uuid }),
    );

    await waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
    rerender();
    rerender();

    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
