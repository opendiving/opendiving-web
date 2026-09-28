import { describe, it, expect, vi, beforeEach } from "vitest";
import { storageAPI } from "./storage";

// The call at the level this module works at: which path it hits and what it
// hands back. The card on top of it is in
// `components/settings/storage-card.render.test.tsx`.
vi.mock("./client", () => ({
  apiClient: { get: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);

beforeEach(() => {
  get.mockReset();
});

describe("getUsage", () => {
  it("reads the figures off the usage route", async () => {
    const usage = {
      used_bytes: 3_000,
      limit_bytes: 1024 ** 3,
      dive_files_bytes: 1_000,
      certification_files_bytes: 1_500,
      pictures_bytes: 500,
    };
    get.mockResolvedValue({ data: usage });

    await expect(storageAPI.getUsage()).resolves.toEqual(usage);
    expect(get).toHaveBeenCalledWith("/user/storage");
  });

  // An instance with no limit answers `null`, which the card reads as "no bar";
  // it must arrive as `null` rather than be defaulted to a number here.
  it("passes a missing limit through as null", async () => {
    get.mockResolvedValue({
      data: {
        used_bytes: 0,
        limit_bytes: null,
        dive_files_bytes: 0,
        certification_files_bytes: 0,
        pictures_bytes: 0,
      },
    });

    const usage = await storageAPI.getUsage();

    expect(usage.limit_bytes).toBeNull();
  });

  it("lets a failure reach the caller", async () => {
    get.mockRejectedValue({ response: { status: 500 } });

    await expect(storageAPI.getUsage()).rejects.toMatchObject({
      response: { status: 500 },
    });
  });
});
