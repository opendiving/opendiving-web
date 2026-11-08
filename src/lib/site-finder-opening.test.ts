import { describe, expect, it } from "vitest";
import { partHolds, sitesOpening } from "./site-finder-opening";

const DAHAB = {
  name: "Dahab, South Sinai, Egypt",
  latitude: 28.5,
  longitude: 34.5,
};
const dive = {
  entry_latitude: null,
  entry_longitude: null,
  dive_sites: [
    { uuid: "s", name: "Canyon", latitude: 28.57, longitude: 34.54 },
  ],
};

describe("partHolds", () => {
  it("holds the days between its dates, both ends included", () => {
    const part = { start_date: "2026-11-01", end_date: "2026-11-08" };
    expect(partHolds(part, "2026-11-01")).toBe(true);
    expect(partHolds(part, "2026-11-08")).toBe(true);
    expect(partHolds(part, "2026-11-09")).toBe(false);
  });

  it("reads a part dated at one end as that day, and one with none as no day", () => {
    expect(partHolds({ start_date: "2026-11-08" }, "2026-11-08")).toBe(true);
    expect(partHolds({ end_date: "2026-11-08" }, "2026-11-07")).toBe(false);
    expect(partHolds({}, "2026-11-08")).toBe(false);
  });
});

describe("sitesOpening", () => {
  const today = "2026-11-08";

  it("opens on a part holding today first, its box where it has one", () => {
    expect(
      sitesOpening({
        tripParts: [
          { start_date: "2026-10-01", end_date: "2026-10-05", location: DAHAB },
          {
            start_date: "2026-11-07",
            end_date: "2026-11-10",
            location: {
              ...DAHAB,
              bbox_south: 28.4,
              bbox_north: 28.6,
              bbox_west: 34.4,
              bbox_east: 34.6,
            },
          },
        ],
        newestDive: dive,
        today,
      }),
    ).toEqual({
      kind: "bounds",
      south: 28.4,
      north: 28.6,
      west: 34.4,
      east: 34.6,
    });
  });

  it("passes over a part holding today that has no place", () => {
    expect(
      sitesOpening({
        tripParts: [
          { start_date: today, end_date: today, location: { name: "Home" } },
        ],
        newestDive: dive,
        today,
      }),
    ).toEqual({ kind: "point", latitude: 28.57, longitude: 34.54 });
  });

  it("opens on the newest dive's entry fix before its site's pin", () => {
    expect(
      sitesOpening({
        tripParts: [],
        newestDive: { ...dive, entry_latitude: 1, entry_longitude: 2 },
        today,
      }),
    ).toEqual({ kind: "point", latitude: 1, longitude: 2 });
  });

  it("opens on the world with nothing to go by", () => {
    expect(
      sitesOpening({
        tripParts: [],
        newestDive: { ...dive, dive_sites: [{ uuid: "s", name: "Pinless" }] },
        today,
      }),
    ).toBeNull();
    expect(sitesOpening({ tripParts: [], newestDive: null, today })).toBeNull();
  });
});
