import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useResource } from "./useResource";
import { clearResourceCache, readResourceCache } from "@/lib/resource-cache";

const push = vi.fn();
const toast = vi.fn();
let params: Record<string, string | string[]> = { id: "dive-1" };

// The router object is hoisted rather than built per call: Next's real `useRouter`
// returns a stable reference, and `useResource`'s fetch effect depends on it. A mock
// that returns a fresh object every render would re-run the effect forever - an
// artefact of the mock, but one that looks exactly like a product bug.
const router = { push };
vi.mock("next/navigation", () => ({
  useParams: () => params,
  useRouter: () => router,
}));
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const OPTIONS = {
  errorMessage: "Failed to load dive details. Please try again.",
  redirectTo: "/dives",
};

beforeEach(() => {
  push.mockClear();
  toast.mockClear();
  params = { id: "dive-1" };
  clearResourceCache();
});

describe("useResource", () => {
  it("fetches by route param and settles", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ uuid: "dive-1", notes: "viz" });
    const { result } = renderHook(() => useResource(fetchFn, OPTIONS));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchFn).toHaveBeenCalledWith("dive-1");
    expect(result.current.resource).toEqual({ uuid: "dive-1", notes: "viz" });
    expect(result.current.id).toBe("dive-1");
    expect(toast).not.toHaveBeenCalled();
  });

  it("toasts and redirects when the fetch fails", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("404"));
    const { result } = renderHook(() => useResource(fetchFn, OPTIONS));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: OPTIONS.errorMessage,
        variant: "destructive",
      }),
    );
    expect(push).toHaveBeenCalledWith("/dives");
  });

  // The drift this hook was extracted to fix: some pages guarded against settling
  // after unmount and some did not, so navigating away from a slow page still fired
  // a toast and a redirect on whatever the diver had landed on.
  it("does not toast or redirect once unmounted", async () => {
    let reject: (reason: unknown) => void = () => {};
    const fetchFn = vi.fn(
      () =>
        new Promise((_, rej) => {
          reject = rej;
        }),
    );
    const { unmount } = renderHook(() => useResource(fetchFn, OPTIONS));

    unmount();
    await act(async () => {
      reject(new Error("404"));
      await Promise.resolve();
    });

    expect(toast).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("waits for `enabled` before fetching", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ uuid: "dive-1" });
    const { rerender } = renderHook(
      ({ enabled }) => useResource(fetchFn, { ...OPTIONS, enabled }),
      { initialProps: { enabled: false } },
    );

    expect(fetchFn).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
  });

  it("hands each loaded resource to `onLoaded`", async () => {
    const onLoaded = vi.fn();
    const fetchFn = vi.fn().mockResolvedValue({ uuid: "dive-1" });
    renderHook(() => useResource(fetchFn, { ...OPTIONS, onLoaded }));

    await waitFor(() =>
      expect(onLoaded).toHaveBeenCalledWith({ uuid: "dive-1" }),
    );
  });

  it("does not restart the fetch when `onLoaded` changes identity", async () => {
    // The dive edit page passes an arrow function that closes over its form; held in
    // a ref precisely so writing the obvious thing doesn't loop.
    const fetchFn = vi.fn().mockResolvedValue({ uuid: "dive-1" });
    const { rerender } = renderHook(
      () => useResource(fetchFn, { ...OPTIONS, onLoaded: () => {} }),
      {},
    );

    await waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
    rerender();
    rerender();
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("refetches without blanking the page or redirecting on failure", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ uuid: "dive-1", notes: "before" })
      .mockRejectedValueOnce(new Error("500"));
    const { result } = renderHook(() => useResource(fetchFn, OPTIONS));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.refetch());

    // `refetch` is used after an edit the diver has already been told succeeded, so
    // a failure there leaves the page alone rather than throwing them out of it.
    expect(result.current.isLoading).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(result.current.resource).toEqual({
      uuid: "dive-1",
      notes: "before",
    });
  });
});

describe("useResource with a cacheKey", () => {
  it("shows a record it has seen before without a loading state", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ uuid: "dive-1", notes: "viz" });
    const options = { ...OPTIONS, cacheKey: "dive" };

    const first = renderHook(() => useResource(fetchFn, options));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    // The second visit is the point of the whole exercise: the record is on
    // screen from the first render, with no pass through `isLoading`.
    const second = renderHook(() => useResource(fetchFn, options));
    expect(second.result.current.resource).toEqual({
      uuid: "dive-1",
      notes: "viz",
    });
    expect(second.result.current.isLoading).toBe(false);
  });

  it("still refetches behind the cached copy, and takes the fresh answer", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ uuid: "dive-1", notes: "before" })
      .mockResolvedValueOnce({ uuid: "dive-1", notes: "after" });
    const options = { ...OPTIONS, cacheKey: "dive" };

    const first = renderHook(() => useResource(fetchFn, options));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() => useResource(fetchFn, options));
    expect(second.result.current.resource).toEqual({
      uuid: "dive-1",
      notes: "before",
    });

    // Stale-*while-revalidate*: showing the old copy must not mean skipping the
    // request, or an edit made in another tab would never appear.
    await waitFor(() =>
      expect(second.result.current.resource).toEqual({
        uuid: "dive-1",
        notes: "after",
      }),
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("keys on the route id, so one record is not served for another", async () => {
    const fetchFn = vi
      .fn()
      .mockImplementation((id: string) => Promise.resolve({ uuid: id }));
    const options = { ...OPTIONS, cacheKey: "dive" };

    const first = renderHook(() => useResource(fetchFn, options));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    params = { id: "dive-2" };
    const second = renderHook(() => useResource(fetchFn, options));
    expect(second.result.current.isLoading).toBe(true);
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.resource).toEqual({ uuid: "dive-2" });
  });

  it("caches nothing without a cacheKey", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ uuid: "dive-1" });

    const first = renderHook(() => useResource(fetchFn, OPTIONS));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() => useResource(fetchFn, OPTIONS));
    expect(second.result.current.isLoading).toBe(true);
    expect(second.result.current.resource).toBeNull();
  });
});

// Axios shapes: what the hook branches on is the status, not the message.
const httpError = (status: number) => ({ response: { status } });

describe("useResource when a revalidation fails", () => {
  const options = { ...OPTIONS, cacheKey: "dive" };

  async function warmThenFail(error: unknown) {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ uuid: "dive-1", notes: "cached" })
      .mockRejectedValueOnce(error);

    const first = renderHook(() => useResource(fetchFn, options));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() => useResource(fetchFn, options));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    return second;
  }

  it("leaves the diver on the page when the refresh merely fails", async () => {
    const second = await warmThenFail(httpError(500));

    // The record is on screen and being read. A blip behind it is not a reason
    // to throw the diver back to the list.
    expect(push).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(second.result.current.resource).toEqual({
      uuid: "dive-1",
      notes: "cached",
    });
  });

  it.each([404, 403, 410])(
    "still redirects when the API says the record is gone (%i)",
    async (status) => {
      await warmThenFail(httpError(status));

      expect(push).toHaveBeenCalledWith("/dives");
      expect(toast).toHaveBeenCalled();
      // And the stale copy goes with it, or every later visit to this URL would
      // render the record from cache and bounce again for five minutes.
      expect(readResourceCache("dive:dive-1")).toBeUndefined();
    },
  );

  it("keeps redirecting when there was nothing cached to fall back on", async () => {
    const fetchFn = vi.fn().mockRejectedValue(httpError(500));
    const { result } = renderHook(() => useResource(fetchFn, options));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Unchanged from before the cache existed: a first load that fails has
    // nothing to show, so leaving is still the only option.
    expect(push).toHaveBeenCalledWith("/dives");
  });
});
