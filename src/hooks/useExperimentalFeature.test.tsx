import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useExperimentalFeature } from "./useExperimentalFeature";

const { getInstanceConfig } = vi.hoisted(() => ({
  getInstanceConfig: vi.fn(),
}));

vi.mock("@/lib/api/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/config")>()),
  configAPI: { getInstanceConfig },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useExperimentalFeature", () => {
  it.each([
    { features: ["dive-planner"], isOn: true },
    { features: ["all"], isOn: true },
    { features: ["all", "dive-planner"], isOn: true },
    { features: ["buddy-match"], isOn: false },
    { features: [], isOn: false },
    // A prefix or a near miss names a different feature.
    { features: ["dive"], isOn: false },
    { features: ["dive-planner-v2"], isOn: false },
  ])("reads $features as isOn=$isOn", async ({ features, isOn }) => {
    getInstanceConfig.mockResolvedValue({ experimental_features: features });

    const { result } = renderHook(() => useExperimentalFeature("dive-planner"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isOn).toBe(isOn);
  });

  it("is off while the config is still loading", () => {
    getInstanceConfig.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useExperimentalFeature("dive-planner"));

    expect(result.current).toEqual({ isOn: false, isLoading: true });
  });

  // An API older than the member, and a response the browser cached before it.
  it("is off when the config lacks the member", async () => {
    getInstanceConfig.mockResolvedValue({ registration_mode: "open" });

    const { result } = renderHook(() => useExperimentalFeature("dive-planner"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isOn).toBe(false);
  });

  it("is off when the config cannot be read", async () => {
    getInstanceConfig.mockRejectedValue(new Error("Network Error"));

    const { result } = renderHook(() => useExperimentalFeature("dive-planner"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isOn).toBe(false);
  });
});
