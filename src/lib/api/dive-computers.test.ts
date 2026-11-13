import { beforeEach, describe, expect, it, vi } from "vitest";
import { diveComputersAPI } from "./dive-computers";

// Which path each call hits and what it hands back; the card's behaviour on top
// of them is in `components/settings/dive-computers-card.render.test.tsx`.
vi.mock("./client", () => ({
  apiClient: { get: vi.fn(), put: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);
const put = vi.mocked(apiClient.put);

const PERDIX = {
  serial: "D9772626",
  brand: "Shearwater",
  model: "Perdix 3",
  name: null,
  position: 0,
};
const PLACED = {
  serial: "253810000400",
  brand: null,
  model: null,
  name: null,
  position: 1,
};

beforeEach(() => {
  get.mockReset();
  put.mockReset();
});

describe("getDiveComputers", () => {
  it("reads the unpaginated list, first to last", async () => {
    get.mockResolvedValue({ data: [PERDIX, PLACED] });

    await expect(diveComputersAPI.getDiveComputers()).resolves.toEqual([
      PERDIX,
      PLACED,
    ]);
    expect(get).toHaveBeenCalledWith("/dive-computers");
  });
});

describe("setOrder", () => {
  it("sends the whole order and hands back the list the API answers", async () => {
    const answer = [
      { ...PLACED, position: 0 },
      { ...PERDIX, position: 1 },
    ];
    put.mockResolvedValue({ data: answer });

    await expect(
      diveComputersAPI.setOrder(["253810000400", "D9772626"]),
    ).resolves.toEqual(answer);
    expect(put).toHaveBeenCalledWith("/dive-computers/order", {
      serials: ["253810000400", "D9772626"],
    });
  });

  it("lets a refusal through to the caller", async () => {
    const refusal = new Error("422");
    put.mockRejectedValue(refusal);

    await expect(diveComputersAPI.setOrder(["A", "a"])).rejects.toBe(refusal);
  });
});
