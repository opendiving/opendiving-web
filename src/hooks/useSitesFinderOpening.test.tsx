import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/api/trips", () => ({ tripsAPI: { getTrips: vi.fn() } }));
vi.mock("@/lib/api/dives", () => ({ divesAPI: { getDives: vi.fn() } }));
vi.mock("@/lib/date-time", () => ({ todayIsoDate: () => "2026-11-08" }));

const { tripsAPI } = await import("@/lib/api/trips");
const { divesAPI } = await import("@/lib/api/dives");
const { useSitesFinderOpening } = await import("./useSitesFinderOpening");
const getTrips = vi.mocked(tripsAPI.getTrips);
const getDives = vi.mocked(divesAPI.getDives);

const page = <T,>(data: T[]) => ({
  data,
  total_count: data.length,
  has_more: false,
  page: 1,
  items_per_page: 10,
});
const TRIP = {
  parts: [
    {
      start_date: "2026-11-07",
      end_date: "2026-11-10",
      location: { name: "Dahab", latitude: 28.5, longitude: 34.5 },
    },
  ],
};
const DIVE = {
  entry_latitude: 1,
  entry_longitude: 2,
  dive_sites: [],
};

beforeEach(() => {
  getTrips.mockReset();
  getDives.mockReset();
});

describe("useSitesFinderOpening", () => {
  it("waits for both reads, so the camera opens once", async () => {
    let answerDives: (value: unknown) => void = () => {};
    getTrips.mockResolvedValue(page([]) as never);
    getDives.mockReturnValue(
      new Promise((resolve) => (answerDives = resolve)) as never,
    );
    const { result } = renderHook(() => useSitesFinderOpening(true));

    await act(async () => {});
    expect(result.current).toBeUndefined();

    await act(async () => answerDives(page([DIVE])));
    expect(result.current).toEqual({
      kind: "point",
      latitude: 1,
      longitude: 2,
    });
    expect(getDives).toHaveBeenCalledWith(1, 1, { sort: "date" });
  });

  it("opens on a trip part holding today before the newest dive", async () => {
    getTrips.mockResolvedValue(page([TRIP]) as never);
    getDives.mockResolvedValue(page([DIVE]) as never);
    const { result } = renderHook(() => useSitesFinderOpening(true));

    await waitFor(() =>
      expect(result.current).toEqual({
        kind: "point",
        latitude: 28.5,
        longitude: 34.5,
      }),
    );
  });

  it("opens on the world when neither read can be had", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getTrips.mockRejectedValue(new Error("down"));
    getDives.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useSitesFinderOpening(true));

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("reads nothing until it is enabled", () => {
    renderHook(() => useSitesFinderOpening(false));
    expect(getTrips).not.toHaveBeenCalled();
    expect(getDives).not.toHaveBeenCalled();
  });
});
