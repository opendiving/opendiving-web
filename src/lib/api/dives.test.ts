import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "./client";
import { MAX_DIVE_FILE_SIZE, divesAPI } from "./dives";

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  apiClient: { get: vi.fn() },
}));

const get = vi.mocked(apiClient.get);

beforeEach(() => {
  get.mockReset();
});

describe("MAX_DIVE_FILE_SIZE", () => {
  it("matches the API's own limit", () => {
    // Mirrored from `services/dive_files.py::MAX_DIVE_FILE_SIZE`. A larger
    // value here would let the client start an upload the API will reject.
    expect(MAX_DIVE_FILE_SIZE).toBe(5 * 1024 * 1024);
  });
});

describe("getRecentVolumes", () => {
  it("sends the dive's start time as `until` and returns the bare list", async () => {
    get.mockResolvedValue({ data: { volumes: [12, 11.1] } });

    await expect(
      divesAPI.getRecentVolumes("2026-10-01T09:00:00+02:00"),
    ).resolves.toEqual([12, 11.1]);
    expect(get).toHaveBeenCalledWith("/dives/recent-volumes", {
      params: { until: "2026-10-01T09:00:00+02:00" },
    });
  });

  it("leaves `until` off when the form has no start time", async () => {
    get.mockResolvedValue({ data: { volumes: [] } });

    await divesAPI.getRecentVolumes(undefined);

    expect(get).toHaveBeenCalledWith("/dives/recent-volumes", { params: {} });
  });
});
