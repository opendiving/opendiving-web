import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDeleteWithReassign } from "./useDeleteWithReassign";

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const deleteFn = vi.fn();

beforeEach(() => {
  toast.mockReset();
  deleteFn.mockReset();
  deleteFn.mockResolvedValue({ message: "Trip deleted", moved_dives: 0 });
});

const setup = () =>
  renderHook(() =>
    useDeleteWithReassign(deleteFn, {
      confirmMessage: "Sure?",
      successMessage: "Trip deleted successfully.",
      errorMessage: "Failed to delete trip. Please try again.",
      onDeleted: vi.fn(),
    }),
  );

const described = () => toast.mock.calls[0][0].description;

describe("useDeleteWithReassign", () => {
  it("passes the replacement to the delete as its second argument", async () => {
    const { result } = setup();
    act(() => result.current.requestDelete("trip-1"));

    await act(async () => {
      await result.current.confirmDelete("trip-2", "Cebu 2026");
    });

    expect(deleteFn).toHaveBeenCalledWith("trip-1", "trip-2");
  });

  it("names the count and the destination once dives have moved", async () => {
    deleteFn.mockResolvedValue({ message: "Trip deleted", moved_dives: 12 });
    const { result } = setup();
    act(() => result.current.requestDelete("trip-1"));

    await act(async () => {
      await result.current.confirmDelete("trip-2", "Cebu 2026");
    });

    await waitFor(() =>
      expect(described()).toBe(
        "Trip deleted successfully. 12 dives moved to Cebu 2026.",
      ),
    );
  });

  it("says one dive rather than 1 dives", async () => {
    deleteFn.mockResolvedValue({ message: "Trip deleted", moved_dives: 1 });
    const { result } = setup();
    act(() => result.current.requestDelete("trip-1"));

    await act(async () => {
      await result.current.confirmDelete("trip-2", "Cebu 2026");
    });

    await waitFor(() => expect(described()).toMatch(/1 dive moved/));
  });

  it("stays quiet about moves on a plain delete", async () => {
    const { result } = setup();
    act(() => result.current.requestDelete("trip-1"));

    await act(async () => {
      await result.current.confirmDelete();
    });

    await waitFor(() => expect(described()).toBe("Trip deleted successfully."));
    expect(deleteFn).toHaveBeenCalledWith("trip-1", undefined);
  });

  it("claims no move when a retry reports that nothing was left to move", async () => {
    // The retry case, and the reason the message is driven by `moved_dives`
    // rather than by "did the diver ask for a move". A repeat call after a lost
    // response succeeds and answers 0, because the first attempt already moved
    // them - so the toast degrades to the plain wording instead of announcing
    // "0 dives moved to Cebu 2026".
    deleteFn.mockResolvedValue({ message: "Trip deleted", moved_dives: 0 });
    const { result } = setup();
    act(() => result.current.requestDelete("trip-1"));

    await act(async () => {
      await result.current.confirmDelete("trip-2", "Cebu 2026");
    });

    await waitFor(() => expect(described()).toBe("Trip deleted successfully."));
  });

  it("keeps two overlapping deletes' destinations apart", async () => {
    // Two rows of a list, each with its own dialog, deleted before the first
    // response lands - and the responses come back in the opposite order. The
    // name is filed under the id being deleted for exactly this: held as a single
    // value, the slower delete's toast would name the faster one's destination.
    const resolvers: Array<(v: unknown) => void> = [];
    deleteFn.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const { result } = setup();

    act(() => result.current.requestDelete("trip-1"));
    let first: Promise<void>;
    act(() => {
      first = result.current.confirmDelete(
        "trip-a",
        "Cebu 2026",
      ) as Promise<void>;
    });
    act(() => result.current.requestDelete("trip-2"));
    let second: Promise<void>;
    act(() => {
      second = result.current.confirmDelete(
        "trip-b",
        "Dahab 2025",
      ) as Promise<void>;
    });

    // Second finishes first, moving 4; then the first, moving 9.
    await act(async () => {
      resolvers[1]({ message: "Trip deleted", moved_dives: 4 });
      await second;
    });
    await act(async () => {
      resolvers[0]({ message: "Trip deleted", moved_dives: 9 });
      await first;
    });

    const messages = toast.mock.calls.map((call) => call[0].description);
    expect(messages).toEqual([
      "Trip deleted successfully. 4 dives moved to Dahab 2025.",
      "Trip deleted successfully. 9 dives moved to Cebu 2026.",
    ]);
  });

  it("does not carry a previous delete's destination into the next one", async () => {
    // The name lives in a ref across the round trip, so a second delete that
    // moves nothing must not inherit the first one's "moved to Cebu 2026".
    deleteFn.mockResolvedValue({ message: "Trip deleted", moved_dives: 3 });
    const { result } = setup();
    act(() => result.current.requestDelete("trip-1"));
    await act(async () => {
      await result.current.confirmDelete("trip-2", "Cebu 2026");
    });

    deleteFn.mockResolvedValue({ message: "Trip deleted", moved_dives: 0 });
    act(() => result.current.requestDelete("trip-3"));
    await act(async () => {
      await result.current.confirmDelete();
    });

    await waitFor(() =>
      expect(toast.mock.calls[1][0].description).toBe(
        "Trip deleted successfully.",
      ),
    );
  });
});
