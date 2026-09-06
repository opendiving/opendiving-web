import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useInstanceConfig } from "./useInstanceConfig";

const { getInstanceConfig } = vi.hoisted(() => ({
  getInstanceConfig: vi.fn(),
}));

vi.mock("@/lib/api/config", () => ({ configAPI: { getInstanceConfig } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useInstanceConfig", () => {
  // The whole body, not a field picked off it: the landing page reads two facts
  // from one answer, and a hook that returned one of them would have it fetching
  // twice or guessing the other.
  it.each([
    { registration_mode: "open", project_operated: false },
    { registration_mode: "invite", project_operated: false },
    { registration_mode: "invite", project_operated: true },
  ])("hands back %o whole", async (config) => {
    getInstanceConfig.mockResolvedValue(config);

    const { result } = renderHook(() => useInstanceConfig());

    expect(result.current).toEqual({ config: null, isLoading: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.config).toEqual(config);
  });

  // A failure is not a config. The landing page's answer for an unknown one is
  // the sign-in form, and that decision belongs at the call site rather than to
  // a default hidden in here - which is also what makes the hook honest about
  // instances whose API is briefly down.
  it("resolves to an unknown config when the API cannot be reached", async () => {
    getInstanceConfig.mockRejectedValue(new Error("Network Error"));

    const { result } = renderHook(() => useInstanceConfig());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.config).toBeNull();
  });

  // Nothing is written to browser storage for it. Every key this app writes has
  // to be registered in `lib/storage-keys.ts` and named on `/privacy` §10, and a
  // value the API already marks publicly cacheable for a minute does not earn
  // one - the browser's own cache is the cache.
  it("caches nothing in browser storage", async () => {
    getInstanceConfig.mockResolvedValue({
      registration_mode: "invite",
      project_operated: false,
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const { result } = renderHook(() => useInstanceConfig());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("reads the config once per mount", async () => {
    getInstanceConfig.mockResolvedValue({
      registration_mode: "invite",
      project_operated: false,
    });

    const { result, rerender } = renderHook(() => useInstanceConfig());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender();

    expect(getInstanceConfig).toHaveBeenCalledTimes(1);
  });
});
