import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiKeysAPI } from "./api-keys";

// The three calls, at the level this module works at: which path each one hits,
// what it sends, and what it hands back. The card on top of them is in
// `components/settings/api-keys-card.render.test.tsx`.
vi.mock("./client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
const remove = vi.mocked(apiClient.delete);

const KEY = {
  uuid: "key-1",
  name: "laptop",
  prefix: "odk_abcd1234",
  scope: "read",
  created_at: "2026-10-28T09:00:00Z",
  last_used_at: null,
  expires_at: "2027-10-28T09:00:00Z",
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  remove.mockReset();
});

describe("getApiKeys", () => {
  it("reads the unpaginated list off the collection route", async () => {
    get.mockResolvedValue({ data: [KEY] });

    await expect(apiKeysAPI.getApiKeys()).resolves.toEqual([KEY]);
    expect(get).toHaveBeenCalledWith("/user/api-keys");
  });

  // The card reads a 404 out of the throw to hide itself on an older API.
  it("lets a failure reach the caller", async () => {
    get.mockRejectedValue({ response: { status: 404 } });

    await expect(apiKeysAPI.getApiKeys()).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

describe("createApiKey", () => {
  it("posts the name, scope and lifetime, and hands back the secret", async () => {
    const created = { ...KEY, secret: `odk_${"x".repeat(43)}` };
    post.mockResolvedValue({ data: created });

    await expect(
      apiKeysAPI.createApiKey({
        name: "laptop",
        scope: "read",
        lifetime: "1y",
      }),
    ).resolves.toEqual(created);
    // Exactly these three fields: the API forbids any other.
    expect(post).toHaveBeenCalledWith("/user/api-keys", {
      name: "laptop",
      scope: "read",
      lifetime: "1y",
    });
  });
});

describe("revokeApiKey", () => {
  it("deletes the singular keyed route", async () => {
    remove.mockResolvedValue({ data: { message: "API key revoked" } });

    await expect(apiKeysAPI.revokeApiKey("key-1")).resolves.toEqual({
      message: "API key revoked",
    });
    expect(remove).toHaveBeenCalledWith("/user/api-key/key-1");
  });
});

describe("detailed permissions", () => {
  it("loads the instance permission catalog", async () => {
    get.mockResolvedValue({ data: ["dives:read", "dives:write"] });
    await expect(apiKeysAPI.getPermissions()).resolves.toEqual([
      "dives:read",
      "dives:write",
    ]);
    expect(get).toHaveBeenCalledWith("/user/api-key-permissions");
  });

  it("submits and validates scoped keys", async () => {
    const key = {
      ...KEY,
      scope: "scoped",
      scopes: ["dives:read"],
      secret: "odk_example",
    };
    post.mockResolvedValue({ data: key });
    const body = {
      name: "laptop",
      scope: "scoped",
      scopes: ["dives:read"],
      lifetime: "1y",
    } satisfies Parameters<typeof apiKeysAPI.createApiKey>[0];
    await expect(apiKeysAPI.createApiKey(body)).resolves.toEqual(key);
    expect(post).toHaveBeenCalledWith("/user/api-keys", body);
    post.mockResolvedValue({ data: { ...key, scopes: null } });
    await expect(apiKeysAPI.createApiKey(body)).rejects.toThrow();
  });
});
