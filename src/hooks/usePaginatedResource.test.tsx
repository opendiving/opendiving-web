import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedResource } from "./usePaginatedResource";
import { clearResourceCache } from "@/lib/resource-cache";
import type { PaginatedResponse } from "@/lib/api/client";

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

function page(
  n: number,
  { total = 30, perPage = 10 } = {},
): PaginatedResponse<{ uuid: string }> {
  return {
    data: Array.from({ length: perPage }, (_, i) => ({
      uuid: `p${n}-${i}`,
    })),
    total_count: total,
    has_more: n * perPage < total,
    page: n,
    items_per_page: perPage,
  };
}

// A fetcher whose responses are resolved by hand, so a slow earlier page can be made
// to land *after* a fast later one - which is the whole point of these tests.
function deferredFetcher() {
  const pending: { page: number; resolve: (v: unknown) => void }[] = [];
  const fetchFn = vi.fn(
    (p: number) =>
      new Promise<PaginatedResponse<{ uuid: string }>>((resolve) => {
        pending.push({ page: p, resolve: resolve as (v: unknown) => void });
      }),
  );
  return { fetchFn, pending };
}

beforeEach(() => {
  toast.mockClear();
  clearResourceCache();
});

describe("usePaginatedResource", () => {
  it("fetches the first page on mount", async () => {
    const fetchFn = vi.fn(async (p: number) => page(p));
    const { result } = renderHook(() => usePaginatedResource(fetchFn));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchFn).toHaveBeenCalledWith(1, 10);
    expect(result.current.currentPage).toBe(1);
    expect(result.current.totalCount).toBe(30);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.items).toHaveLength(10);
  });

  // The bug: paging faster than the network answers put several requests in flight,
  // and an earlier page's slower response overwrote the newer one's rows *and* reset
  // `currentPage` to its own number - the footer saying "page 3" over page 2's rows.
  it("ignores a superseded response that lands late", async () => {
    const { fetchFn, pending } = deferredFetcher();
    const { result } = renderHook(() => usePaginatedResource(fetchFn));

    // Mount's page 1, then the diver clicks through to 2 and 3.
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => void result.current.fetchPage(2));
    act(() => void result.current.fetchPage(3));
    await waitFor(() => expect(pending).toHaveLength(3));

    // They come back in the worst possible order: newest first, oldest last.
    await act(async () => {
      pending[2].resolve(page(3));
      pending[1].resolve(page(2));
      pending[0].resolve(page(1));
    });

    expect(result.current.currentPage).toBe(3);
    expect(result.current.items[0].uuid).toBe("p3-0");
  });

  it("leaves the spinner up while a newer request is still running", async () => {
    const { fetchFn, pending } = deferredFetcher();
    const { result } = renderHook(() => usePaginatedResource(fetchFn));

    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => void result.current.fetchPage(2));
    await waitFor(() => expect(pending).toHaveLength(2));

    // Only the superseded page-1 request settles.
    await act(async () => {
      pending[0].resolve(page(1));
    });

    // Clearing the flag here would flash the old list back mid-load.
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      pending[1].resolve(page(2));
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("does not toast for a superseded request that fails", async () => {
    const { fetchFn, pending } = deferredFetcher();
    const { result } = renderHook(() => usePaginatedResource(fetchFn));

    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => void result.current.fetchPage(2));
    await waitFor(() => expect(pending).toHaveLength(2));

    const failFirst = fetchFn.mock.results[0].value as Promise<unknown>;
    failFirst.catch(() => {});
    await act(async () => {
      pending[1].resolve(page(2));
    });

    expect(toast).not.toHaveBeenCalled();
  });

  it("toasts when the current request fails", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("500"));
    const { result } = renderHook(() =>
      usePaginatedResource(fetchFn, { errorMessage: "Failed to load dives." }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Failed to load dives.",
        variant: "destructive",
      }),
    );
  });

  it("waits for `enabled` before fetching", async () => {
    const fetchFn = vi.fn(async (p: number) => page(p));
    const { rerender } = renderHook(
      ({ enabled }) => usePaginatedResource(fetchFn, { enabled }),
      { initialProps: { enabled: false } },
    );

    expect(fetchFn).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
  });

  it("refetches the page currently on screen", async () => {
    const fetchFn = vi.fn(async (p: number) => page(p));
    const { result } = renderHook(() => usePaginatedResource(fetchFn));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.fetchPage(3));
    fetchFn.mockClear();
    await act(() => result.current.refetch());

    expect(fetchFn).toHaveBeenCalledWith(3, 10);
  });
});

describe("usePaginatedResource with a cacheKey", () => {
  it("shows the rows it showed last time without a loading state", async () => {
    const fetchFn = vi.fn().mockResolvedValue(page(1));
    const options = { cacheKey: "dives:u1" };

    const first = renderHook(() => usePaginatedResource(fetchFn, options));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() => usePaginatedResource(fetchFn, options));
    expect(second.result.current.items).toHaveLength(10);
    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.totalCount).toBe(30);
  });

  it("keys on the page, so page 2 is not served page 1's rows", async () => {
    const fetchFn = vi.fn((n: number) => Promise.resolve(page(n)));
    const options = { cacheKey: "dives:u1" };

    const first = renderHook(() => usePaginatedResource(fetchFn, options));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() => usePaginatedResource(fetchFn, options));
    await act(() => second.result.current.fetchPage(2));

    expect(second.result.current.items[0].uuid).toBe("p2-0");
    expect(second.result.current.currentPage).toBe(2);
  });

  it("keys on the page size as well as the number", async () => {
    const fetchFn = vi.fn((n: number, perPage: number) =>
      Promise.resolve(page(n, { perPage })),
    );

    const ten = renderHook(() =>
      usePaginatedResource(fetchFn, { cacheKey: "dives:u1", itemsPerPage: 10 }),
    );
    await waitFor(() => expect(ten.result.current.isLoading).toBe(false));
    ten.unmount();

    // Same list, same page number, different size - a hit here would show ten
    // rows in a table that holds five.
    const five = renderHook(() =>
      usePaginatedResource(fetchFn, { cacheKey: "dives:u1", itemsPerPage: 5 }),
    );
    expect(five.result.current.isLoading).toBe(true);
    await waitFor(() => expect(five.result.current.isLoading).toBe(false));
    expect(five.result.current.items).toHaveLength(5);
  });

  it("still refetches behind the cached rows", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(page(1, { total: 30 }))
      .mockResolvedValueOnce(page(1, { total: 40 }));
    const options = { cacheKey: "dives:u1" };

    const first = renderHook(() => usePaginatedResource(fetchFn, options));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() => usePaginatedResource(fetchFn, options));
    expect(second.result.current.totalCount).toBe(30);
    await waitFor(() => expect(second.result.current.totalCount).toBe(40));
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("caches nothing without a cacheKey", async () => {
    const fetchFn = vi.fn().mockResolvedValue(page(1));

    const first = renderHook(() => usePaginatedResource(fetchFn));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() => usePaginatedResource(fetchFn));
    expect(second.result.current.isLoading).toBe(true);
    expect(second.result.current.items).toHaveLength(0);
  });
});
