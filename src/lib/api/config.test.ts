import { describe, it, expect, vi, beforeEach } from "vitest";
import { configAPI } from "./config";

// One call, and what matters about it is the path and that the body reaches the
// caller unreshaped - the landing page decides which form to show and which
// voice it speaks in from it, and `hooks/useInstanceConfig.test.tsx` pins that
// the hook hands it on whole.
vi.mock("./client", () => ({ apiClient: { get: vi.fn() } }));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);

beforeEach(() => {
  get.mockReset();
});

describe("getInstanceConfig", () => {
  it.each([
    ["open", false],
    ["invite", false],
    ["invite", true],
  ] as const)(
    "reads registration_mode=%s, project_operated=%s off /config",
    async (mode, projectOperated) => {
      const body = {
        registration_mode: mode,
        project_operated: projectOperated,
      };
      get.mockResolvedValue({ data: body });

      await expect(configAPI.getInstanceConfig()).resolves.toEqual(body);
      expect(get).toHaveBeenCalledWith("/config");
    },
  );

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
