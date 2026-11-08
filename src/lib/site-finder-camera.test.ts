import { describe, expect, it } from "vitest";
import { roundCamera, roundView, targetCenter } from "./site-finder-camera";

describe("roundCamera", () => {
  it("cuts a position to two decimals", () => {
    expect(roundCamera({ latitude: 28.49372, longitude: 34.51687 })).toEqual({
      latitude: 28.49,
      longitude: 34.52,
    });
  });

  it("folds a longitude panned past the antimeridian back into range", () => {
    expect(roundCamera({ latitude: -17.71, longitude: 181.5 })).toEqual({
      latitude: -17.71,
      longitude: -178.5,
    });
  });

  it("sends no negative zero", () => {
    expect(
      Object.is(roundCamera({ latitude: -0.001, longitude: 0 }).latitude, -0),
    ).toBe(false);
  });
});

describe("roundView", () => {
  it("rounds every edge outward, so the box still holds the view", () => {
    expect(
      roundView({
        south: 28.4937,
        north: 28.5513,
        west: 34.4211,
        east: 34.5288,
      }),
    ).toEqual({ south: 28.49, north: 28.56, west: 34.42, east: 34.53 });
  });

  it("keeps an edge already on the grid where it is", () => {
    expect(
      roundView({ south: 0.29, north: 0.3, west: 12.3, east: 12.4 }),
    ).toEqual({ south: 0.29, north: 0.3, west: 12.3, east: 12.4 });
  });

  it("answers a view across the antimeridian with a west above its east", () => {
    expect(
      roundView({ south: -19.2, north: -16.1, west: 176.5, east: 182.3 }),
    ).toEqual({ south: -19.2, north: -16.1, west: 176.5, east: -177.7 });
  });

  it("wraps a view panned a whole turn round", () => {
    expect(
      roundView({ south: 10, north: 20, west: 400.004, east: 410.001 }),
    ).toEqual({ south: 10, north: 20, west: 40, east: 50.01 });
  });

  it("ends a view on the antimeridian at 180, not across it", () => {
    expect(roundView({ south: 0, north: 1, west: 170, east: 180 })).toEqual({
      south: 0,
      north: 1,
      west: 170,
      east: 180,
    });
  });

  it("sends the whole world for a view wider than one", () => {
    expect(roundView({ south: -80, north: 80, west: -300, east: 200 })).toEqual(
      { south: -80, north: 80, west: -180, east: 180 },
    );
  });
});

describe("targetCenter", () => {
  it("centres a box the short way round the antimeridian", () => {
    expect(
      targetCenter({
        kind: "bounds",
        south: -20,
        north: -16,
        west: 177,
        east: -179,
      }),
    ).toEqual({ latitude: -18, longitude: 179 });
  });

  it("is a point's own position", () => {
    expect(targetCenter({ kind: "point", latitude: 1, longitude: 2 })).toEqual({
      latitude: 1,
      longitude: 2,
    });
  });
});
