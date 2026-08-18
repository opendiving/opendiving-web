import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDeleteResource } from "./useDeleteResource";

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const OPTIONS = {
  confirmMessage: "Delete this dive site?",
  successMessage: "Dive site deleted successfully.",
  errorMessage: "Failed to delete dive site. Please try again.",
};

beforeEach(() => {
  toast.mockClear();
});

describe("useDeleteResource", () => {
  it("does nothing until a delete is confirmed", async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    const { result } = renderHook(() =>
      useDeleteResource(deleteFn, { ...OPTIONS, onDeleted }),
    );

    act(() => result.current.requestDelete("site-1"));

    // The confirm dialog is open, but nothing has been deleted.
    expect(result.current.pendingId).toBe("site-1");
    expect(deleteFn).not.toHaveBeenCalled();

    act(() => result.current.cancelDelete());
    expect(result.current.pendingId).toBeNull();
    expect(deleteFn).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("deletes, reports success and notifies the caller", async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    const { result } = renderHook(() =>
      useDeleteResource(deleteFn, { ...OPTIONS, onDeleted }),
    );

    act(() => result.current.requestDelete("site-1"));
    await act(() => result.current.confirmDelete());

    // The second argument is the one only `deleteTrip`/`deleteDiveSite` take -
    // the uuid to move the resource's dives onto. It is passed unconditionally
    // and is `undefined` here, which the five deletes that take a single id
    // ignore.
    expect(deleteFn).toHaveBeenCalledWith("site-1", undefined);
    expect(onDeleted).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: OPTIONS.successMessage }),
    );
    await waitFor(() => expect(result.current.deletingId).toBeNull());
  });

  // The bug this hook's detail-page callers used to have: only `gear/[id]` ran the
  // failure through `getApiErrorMessage`, so a 409 explaining *why* the delete was
  // refused was replaced by "Please try again." on dives, sites and trips.
  it("shows the API's own message when the delete is refused", async () => {
    const deleteFn = vi.fn().mockRejectedValue({
      response: { data: { detail: "This dive site is used by 3 dives." } },
    });
    const { result } = renderHook(() =>
      useDeleteResource(deleteFn, { ...OPTIONS, onDeleted: vi.fn() }),
    );

    act(() => result.current.requestDelete("site-1"));
    await act(() => result.current.confirmDelete());

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "This dive site is used by 3 dives.",
        variant: "destructive",
      }),
    );
    // And specifically *not* the advice that would send the diver round the loop again.
    expect(toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: OPTIONS.errorMessage }),
    );
  });

  it("falls back to its own message when the failure carries none", async () => {
    const deleteFn = vi.fn().mockRejectedValue(new Error("Network Error"));
    const onDeleted = vi.fn();
    const { result } = renderHook(() =>
      useDeleteResource(deleteFn, { ...OPTIONS, onDeleted }),
    );

    act(() => result.current.requestDelete("site-1"));
    await act(() => result.current.confirmDelete());

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: OPTIONS.errorMessage }),
    );
    // A failed delete must not run the caller's "it's gone" handler, which on a
    // detail page navigates away from a resource that is still there.
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("clears the busy flag even when the delete throws", async () => {
    const deleteFn = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() =>
      useDeleteResource(deleteFn, { ...OPTIONS, onDeleted: vi.fn() }),
    );

    act(() => result.current.requestDelete("site-1"));
    await act(() => result.current.confirmDelete());

    await waitFor(() => expect(result.current.deletingId).toBeNull());
  });
});
