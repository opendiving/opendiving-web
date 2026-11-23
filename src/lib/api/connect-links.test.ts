import { describe, it, expect, vi, beforeEach } from "vitest";
import { connectLinksAPI, connectLinkUrl } from "./connect-links";

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
const remove = vi.mocked(apiClient.delete);

const TOKEN = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  remove.mockReset();
});

describe("connectLinkUrl", () => {
  it("is the connect page on the given origin", () => {
    expect(connectLinkUrl("https://dive.example", TOKEN)).toBe(
      `https://dive.example/connect/${TOKEN}`,
    );
  });
});

describe("the owner's link", () => {
  it("reads it, and reads a 404 as no link", async () => {
    get.mockResolvedValueOnce({ data: { token: TOKEN, created_at: "x" } });
    await expect(connectLinksAPI.getOwn()).resolves.toEqual({
      token: TOKEN,
      created_at: "x",
    });
    expect(get).toHaveBeenCalledWith("/user/connect-link");

    get.mockRejectedValueOnce({ response: { status: 404 } });
    await expect(connectLinksAPI.getOwn()).resolves.toBeNull();
  });

  it("makes, resets and removes it on one path", async () => {
    post.mockResolvedValue({ data: { token: TOKEN, created_at: "x" } });
    remove.mockResolvedValue({ data: { message: "Connect link removed" } });

    await connectLinksAPI.create();
    await connectLinksAPI.remove();

    expect(post).toHaveBeenCalledWith("/user/connect-link");
    expect(remove).toHaveBeenCalledWith("/user/connect-link");
  });
});

describe("reading a token", () => {
  // Signed out the anonymous route, which never answers the username.
  it("resolves it signed out without the username's route", async () => {
    get.mockResolvedValue({ data: { name: "Sam", avatar_sha256: null } });

    await expect(connectLinksAPI.resolve(TOKEN)).resolves.toEqual({
      name: "Sam",
      avatar_sha256: null,
    });
    expect(get).toHaveBeenCalledWith(`/connect-link/${TOKEN}`);
  });

  it("resolves it signed in on the owner route", async () => {
    get.mockResolvedValue({ data: { name: "Sam", username: "sam" } });

    await connectLinksAPI.resolveForYou(TOKEN);

    expect(get).toHaveBeenCalledWith(`/connect-link/${TOKEN}/owner`);
  });

  it("reads a dead token as null on both routes", async () => {
    get.mockRejectedValue({ response: { status: 404 } });

    await expect(connectLinksAPI.resolve(TOKEN)).resolves.toBeNull();
    await expect(connectLinksAPI.resolveForYou(TOKEN)).resolves.toBeNull();
  });

  it.each(["", "../user", "A".repeat(32), "a".repeat(33)])(
    "answers null for %j without asking",
    async (token) => {
      await expect(connectLinksAPI.resolve(token)).resolves.toBeNull();
      await expect(connectLinksAPI.resolveForYou(token)).resolves.toBeNull();
      expect(get).not.toHaveBeenCalled();
    },
  );

  it("lets any other failure reach the caller", async () => {
    get.mockRejectedValue(new Error("Network Error"));

    await expect(connectLinksAPI.resolve(TOKEN)).rejects.toThrow(
      "Network Error",
    );
  });

  it("reads the owner's picture by version", async () => {
    get.mockResolvedValue({ data: new Blob() });

    await connectLinksAPI.getOwnerPictureBlob(TOKEN, "abc");

    expect(get).toHaveBeenCalledWith(`/connect-link/${TOKEN}/avatar`, {
      params: { v: "abc" },
      responseType: "blob",
    });
  });
});
