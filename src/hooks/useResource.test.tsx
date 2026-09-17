import { Activity } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useResource } from "./useResource";

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
  // A route the diver left is kept mounted and its effects are re-created on the way
  // back. Re-reading is right - an edit saved from `/dives/[id]/edit` pushes back to
  // the detail route, and a page trusting only what it held would show the dive as it
  // was before the save. Doing it *quietly* is what keeps the page and any form on it
  // intact while that happens.
  describe("on the way back to a kept-mounted route", () => {
    function hosted(
      fetchFn: (id: string) => Promise<unknown>,
      onLoaded?: (resource: unknown) => void,
      seen?: { isLoading: boolean[] },
    ) {
      function Detail() {
        const { isLoading } = useResource(fetchFn, { ...OPTIONS, onLoaded });
        seen?.isLoading.push(isLoading);
        return null;
      }
      return function Host({ hidden }: { hidden: boolean }) {
        return (
          <Activity mode={hidden ? "hidden" : "visible"}>
            <Detail />
          </Activity>
        );
      };
    }

    it("re-reads the record", async () => {
      const fetchFn = vi.fn().mockResolvedValue({ uuid: "dive-1" });
      const Host = hosted(fetchFn);

      const { rerender } = render(<Host hidden={false} />);
      await waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());

      await act(async () => {
        rerender(<Host hidden />);
      });
      await act(async () => {
        rerender(<Host hidden={false} />);
      });

      await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    });

    it("does not blank the page into its skeleton while it does", async () => {
      const fetchFn = vi.fn().mockResolvedValue({ uuid: "dive-1" });
      const seen = { isLoading: [] as boolean[] };
      const Host = hosted(fetchFn, undefined, seen);

      const { rerender } = render(<Host hidden={false} />);
      await waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
      seen.isLoading.length = 0;

      await act(async () => {
        rerender(<Host hidden />);
      });
      await act(async () => {
        rerender(<Host hidden={false} />);
      });
      await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));

      expect(seen.isLoading).not.toContain(true);
    });

    // The half that loses work: `onLoaded` is the dive edit page's `form.reset`.
    it("does not re-seed a form from what comes back", async () => {
      const fetchFn = vi.fn().mockResolvedValue({ uuid: "dive-1" });
      const onLoaded = vi.fn();
      const Host = hosted(fetchFn, onLoaded);

      const { rerender } = render(<Host hidden={false} />);
      await waitFor(() => expect(onLoaded).toHaveBeenCalledOnce());

      await act(async () => {
        rerender(<Host hidden />);
      });
      await act(async () => {
        rerender(<Host hidden={false} />);
      });
      await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));

      expect(onLoaded).toHaveBeenCalledOnce();
    });
  });

  // The other half of the guard, and the reason it records on settle rather than on
  // start: hiding mid-flight abandons the request, so the work is still owed and the
  // return has to make it properly - with its loading state, not as a quiet re-read.
  it("loads on show when the hide interrupted the first fetch", async () => {
    let settle: (value: unknown) => void = () => {};
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (settle = resolve)),
      )
      .mockResolvedValue({ uuid: "dive-1" });

    function Detail() {
      useResource(fetchFn, OPTIONS);
      return null;
    }
    function Host({ hidden }: { hidden: boolean }) {
      return (
        <Activity mode={hidden ? "hidden" : "visible"}>
          <Detail />
        </Activity>
      );
    }

    const { rerender } = render(<Host hidden={false} />);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());

    await act(async () => {
      rerender(<Host hidden />);
    });
    await act(async () => {
      settle({ uuid: "dive-1" });
    });
    await act(async () => {
      rerender(<Host hidden={false} />);
    });

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
  });
});
