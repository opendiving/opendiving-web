import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDialogApiError } from "./useDialogApiError";

describe("useDialogApiError", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useDialogApiError(false, vi.fn()));
    expect(result.current[0]).toBeNull();
  });

  it("holds a message set while the dialog is open", () => {
    const { result } = renderHook(() => useDialogApiError(true, vi.fn()));

    act(() => result.current[1]("Name already taken."));

    expect(result.current[0]).toBe("Name already taken.");
  });

  // The behaviour every create/edit dialog needs: reopening after a failed
  // save must not greet the diver with the previous attempt's error.
  it("clears the message when the dialog reopens", () => {
    const { result, rerender } = renderHook(
      ({ open }) => useDialogApiError(open, vi.fn()),
      { initialProps: { open: true } },
    );

    act(() => result.current[1]("Name already taken."));
    rerender({ open: false });

    // Still there while closing - the dialog animates out, and blanking the message
    // mid-animation is a visible flicker.
    expect(result.current[0]).toBe("Name already taken.");

    rerender({ open: true });
    expect(result.current[0]).toBeNull();
  });

  it("does not clear on an unrelated re-render while open", () => {
    const { result, rerender } = renderHook(
      ({ open }) => useDialogApiError(open, vi.fn()),
      { initialProps: { open: true } },
    );

    act(() => result.current[1]("Name already taken."));
    rerender({ open: true });

    expect(result.current[0]).toBe("Name already taken.");
  });

  it("clears the message when the diver dismisses the dialog, and passes the change on", () => {
    const onOpenChange = vi.fn();
    const { result } = renderHook(() => useDialogApiError(true, onOpenChange));

    act(() => result.current[1]("Name already taken."));
    act(() => result.current[2](false));

    expect(result.current[0]).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
