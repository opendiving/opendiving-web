import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLinkToken } from "./useLinkToken";

// Read off the live location, as Next's own hook is once its router has synced to a
// `replaceState` - so a render after the strip sees no token, which is the case the
// hook's state exists for.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/auth/verify?token=tok&utm=mail");
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("useLinkToken", () => {
  it("keeps the token after taking it out of the address bar, under Strict Mode", async () => {
    const replace = vi.spyOn(window.history, "replaceState");

    const { result, rerender } = renderHook(() => useLinkToken(), {
      wrapper: StrictMode,
    });

    expect(result.current).toBe("tok");
    await waitFor(() => expect(window.location.search).not.toContain("token"));
    rerender();
    expect(result.current).toBe("tok");
    // Strict Mode's second effect does not strip a second time.
    expect(replace).toHaveBeenCalledTimes(1);
    replace.mockRestore();
  });

  it("leaves the rest of the query alone", async () => {
    renderHook(() => useLinkToken());

    await waitFor(() => expect(window.location.search).toBe("?utm=mail"));
    expect(window.location.pathname).toBe("/auth/verify");
  });

  it("is null, and touches nothing, for a link without one", async () => {
    window.history.replaceState(null, "", "/auth/verify");
    const replace = vi.spyOn(window.history, "replaceState");

    const { result } = renderHook(() => useLinkToken());
    await new Promise((done) => setTimeout(done));

    expect(result.current).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });
});
