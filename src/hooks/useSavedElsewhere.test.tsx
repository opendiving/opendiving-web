import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSavedElsewhere } from "./useSavedElsewhere";
import { announceSavedElsewhere } from "@/lib/saved-elsewhere";

describe("useSavedElsewhere", () => {
  it("hears its own kind, and not the other", () => {
    const listener = vi.fn();
    renderHook(() => useSavedElsewhere("gear-service", listener));

    announceSavedElsewhere("certification", {
      certification: { uuid: "cert-1" } as never,
    });
    announceSavedElsewhere("gear-service", { gearItemUuid: "item-1" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ gearItemUuid: "item-1" });
  });

  it("calls the listener it was last rendered with", () => {
    // An inline arrow is what every caller writes, and it closes over that render's
    // state - a subscription holding the first one would act on stale values.
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ listener }) => useSavedElsewhere("gear-service", listener),
      { initialProps: { listener: first } },
    );
    rerender({ listener: second });

    announceSavedElsewhere("gear-service", { gearItemUuid: "item-1" });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops hearing once unmounted", () => {
    const listener = vi.fn();
    const { unmount } = renderHook(() =>
      useSavedElsewhere("gear-service", listener),
    );
    unmount();

    announceSavedElsewhere("gear-service", { gearItemUuid: "item-1" });

    expect(listener).not.toHaveBeenCalled();
  });
});
