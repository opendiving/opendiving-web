import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast, useToast } from "./use-toast";

// Every test starts from an empty store: the module state is shared, and a toast left
// behind by one test is exactly the kind of thing that makes the next one pass for the
// wrong reason.
afterEach(() => {
  const { result } = renderHook(() => useToast());
  act(() => result.current.dismiss());
  vi.useRealTimers();
});

describe("useToast", () => {
  it("shows a toast raised while a subscriber is mounted", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: "Error", description: "Failed to load dive details." });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      title: "Error",
      description: "Failed to load dive details.",
      open: true,
    });
  });

  // `dispatch` notifies whoever is subscribed at that instant and nothing re-delivers,
  // so a toast can be raised while `listeners` is still empty - `<Toaster />`'s effect
  // runs after the page's. Reading the snapshot during render is what covers it.
  //
  // Note this particular case also passes with upstream's effect-based subscription,
  // which seeds `useState(memoryState)` on mount. The case it cannot cover - a
  // subscriber already rendered when the toast lands, whose effect has not run yet -
  // is a render-timing window that `renderHook` flushes past, so it is pinned by the
  // store's shape rather than by a test.
  it("shows a toast that was raised before anything subscribed", () => {
    act(() => {
      toast({ title: "Error", description: "Failed to load trip details." });
    });

    const { result } = renderHook(() => useToast());

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].description).toBe(
      "Failed to load trip details.",
    );
  });

  it("delivers to every subscriber", () => {
    const a = renderHook(() => useToast());
    const b = renderHook(() => useToast());

    act(() => {
      toast({ description: "Saved" });
    });

    expect(a.result.current.toasts).toHaveLength(1);
    expect(b.result.current.toasts).toHaveLength(1);
  });

  it("stops delivering to an unmounted subscriber", () => {
    const a = renderHook(() => useToast());
    const b = renderHook(() => useToast());
    b.unmount();

    act(() => {
      toast({ description: "Saved" });
    });

    // The real assertion is that this does not throw: notifying a torn-down
    // subscriber is what an unbalanced subscribe/unsubscribe would do.
    expect(a.result.current.toasts).toHaveLength(1);
  });

  it("keeps only the newest toast", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ description: "first" });
      toast({ description: "second" });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].description).toBe("second");
  });

  it("marks a toast closed on dismiss, then drops it after the exit animation", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());

    let handle: { dismiss: () => void };
    act(() => {
      handle = toast({ description: "Saved" });
    });

    act(() => handle.dismiss());

    // Still present so Radix has something to animate out - just not open.
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].open).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("dismisses via the onOpenChange Radix calls when it auto-closes", async () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ description: "Saved" });
    });
    act(() => result.current.toasts[0].onOpenChange!(false));

    await waitFor(() => expect(result.current.toasts[0].open).toBe(false));
  });

  it("updates a toast in place", () => {
    const { result } = renderHook(() => useToast());

    let handle: {
      update: (props: { id: string; description: string }) => void;
    };
    act(() => {
      handle = toast({ description: "Uploading..." });
    });
    act(() =>
      handle.update({ id: result.current.toasts[0].id, description: "Done" }),
    );

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].description).toBe("Done");
  });
});
