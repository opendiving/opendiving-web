import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useRegistrationMode } from "./useRegistrationMode";

const { getInstanceConfig } = vi.hoisted(() => ({
  getInstanceConfig: vi.fn(),
}));

vi.mock("@/lib/api/config", () => ({ configAPI: { getInstanceConfig } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useRegistrationMode", () => {
  it.each(["open", "invite"] as const)("resolves to %s", async (mode) => {
    getInstanceConfig.mockResolvedValue({ registration_mode: mode });

    const { result } = renderHook(() => useRegistrationMode());

    expect(result.current).toEqual({ mode: null, isLoading: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.mode).toBe(mode);
  });

  // A failure is not a mode. The landing page's answer for an unknown mode is the
  // sign-in form, and that decision belongs at the call site rather than to a
  // default hidden in here - which is also what makes the hook honest about
  // instances whose API is briefly down.
  it("resolves to an unknown mode when the API cannot be reached", async () => {
    getInstanceConfig.mockRejectedValue(new Error("Network Error"));

    const { result } = renderHook(() => useRegistrationMode());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.mode).toBeNull();
  });

  // Nothing is written to browser storage for the mode. Every key this app writes
  // has to be registered in `lib/storage-keys.ts` and named on `/privacy` §10, and
  // a value the API already marks publicly cacheable for a minute does not earn
  // one - the browser's own cache is the cache.
  it("caches nothing in browser storage", async () => {
    getInstanceConfig.mockResolvedValue({ registration_mode: "invite" });
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const { result } = renderHook(() => useRegistrationMode());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("reads the config once per mount", async () => {
    getInstanceConfig.mockResolvedValue({ registration_mode: "invite" });

    const { result, rerender } = renderHook(() => useRegistrationMode());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender();

    expect(getInstanceConfig).toHaveBeenCalledTimes(1);
  });
});
