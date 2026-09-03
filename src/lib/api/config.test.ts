import { describe, it, expect, vi, beforeEach } from "vitest";
import { configAPI } from "./config";

// One call, and what matters about it is the path and that the body reaches the
// caller unreshaped - the landing page decides which form to show from it, and
// `hooks/useRegistrationMode.test.tsx` pins that decision.
vi.mock("./client", () => ({ apiClient: { get: vi.fn() } }));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);

beforeEach(() => {
  get.mockReset();
});

describe("getInstanceConfig", () => {
  it.each(["open", "invite"] as const)("reads %s off /config", async (mode) => {
    get.mockResolvedValue({ data: { registration_mode: mode } });

    await expect(configAPI.getInstanceConfig()).resolves.toEqual({
      registration_mode: mode,
    });
    expect(get).toHaveBeenCalledWith("/config");
  });

  // Anonymous on both sides: no token is attached here and none is needed, which
  // is the whole point - the caller has no session yet and is deciding whether to
  // offer them a way to get one.
  it("lets a failure reach the caller", async () => {
    get.mockRejectedValue(new Error("Network Error"));

    await expect(configAPI.getInstanceConfig()).rejects.toThrow(
      "Network Error",
    );
  });
});
