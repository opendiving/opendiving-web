import { describe, it, expect, vi, beforeEach } from "vitest";
import { configAPI } from "./config";

// Three calls. For `/config` what matters is the path and that the body reaches the
// caller unreshaped - the landing page decides which form to show and which voice
// it speaks in from it, and `hooks/useInstanceConfig.test.tsx` pins that the hook
// hands it on whole.
vi.mock("./client", () => ({ apiClient: { get: vi.fn() } }));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);

beforeEach(() => {
  get.mockReset();
});

describe("getInstanceConfig", () => {
  it.each([
    ["open", false, false],
    ["invite", false, true],
    ["invite", true, false],
  ] as const)(
    "reads registration_mode=%s, project_operated=%s, join_links=%s off /config",
    async (mode, projectOperated, joinLinks) => {
      const body = {
        registration_mode: mode,
        project_operated: projectOperated,
        join_links: joinLinks,
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

describe("getJoinChannel", () => {
  it("resolves a live slug to its channel", async () => {
    get.mockResolvedValue({
      data: { slug: "scubaboard", label: "ScubaBoard" },
    });

    await expect(configAPI.getJoinChannel("scubaboard")).resolves.toEqual({
      slug: "scubaboard",
      label: "ScubaBoard",
    });
    expect(get).toHaveBeenCalledWith("/join-channel/scubaboard");
  });

  // The ordinary answer for a link that no longer works, so it is a value rather
  // than an error the page would have to tell apart from a network failure.
  it("answers null for a slug the API does not know", async () => {
    get.mockRejectedValue({ response: { status: 404 } });

    await expect(configAPI.getJoinChannel("gone")).resolves.toBeNull();
  });

  // A `via` is whatever the address bar held. One no operator could configure is
  // answered here, so nothing arbitrary is spliced into a request path.
  it.each(["", "ScubaBoard", "../config", "a".repeat(33), "scuba board"])(
    "answers null for %j without asking",
    async (slug) => {
      await expect(configAPI.getJoinChannel(slug)).resolves.toBeNull();
      expect(get).not.toHaveBeenCalled();
    },
  );

  it("lets any other failure reach the caller", async () => {
    get.mockRejectedValue(new Error("Network Error"));

    await expect(configAPI.getJoinChannel("scubaboard")).rejects.toThrow(
      "Network Error",
    );
  });
});

describe("getInviteLink", () => {
  const TOKEN = "0123456789abcdef0123456789abcdef";

  it("resolves a live token to the member who made it", async () => {
    get.mockResolvedValue({ data: { inviter_name: "Sam Diver" } });

    await expect(configAPI.getInviteLink(TOKEN)).resolves.toEqual({
      token: TOKEN,
      inviterName: "Sam Diver",
    });
    expect(get).toHaveBeenCalledWith(`/invite-link/${TOKEN}`);
  });

  // Unknown, reset, removed, a deleted owner and an open-mode instance are one
  // indistinguishable 404, and all of them are the ordinary landing page.
  it("answers null for a token the API does not know", async () => {
    get.mockRejectedValue({ response: { status: 404 } });

    await expect(configAPI.getInviteLink(TOKEN)).resolves.toBeNull();
  });

  it.each(["", "../user", "A".repeat(32), "a".repeat(33)])(
    "answers null for %j without asking",
    async (token) => {
      await expect(configAPI.getInviteLink(token)).resolves.toBeNull();
      expect(get).not.toHaveBeenCalled();
    },
  );

  it("lets any other failure reach the caller", async () => {
    get.mockRejectedValue(new Error("Network Error"));

    await expect(configAPI.getInviteLink(TOKEN)).rejects.toThrow(
      "Network Error",
    );
  });
});
