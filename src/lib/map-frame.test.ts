import { describe, expect, it } from "vitest";

import { unionBounds } from "@/lib/basemap";
import { placedLocations } from "@/lib/map-frame";

const FIJI = {
  latitude: -17.7,
  longitude: 179,
  bbox_south: -21,
  bbox_north: -11,
  bbox_west: -180,
  bbox_east: 180,
};

const APIA = {
  latitude: -13.83,
  longitude: -171.77,
  bbox_south: -13.9,
  bbox_north: -13.75,
  bbox_west: -171.85,
  bbox_east: -171.7,
};

const boundsOf = (location: Parameters<typeof placedLocations>[0][number]) =>
  placedLocations([location])[0].bounds;

describe("placedLocations", () => {
  it("reads a box round the world as its height, around the place's point", () => {
    expect(boundsOf(FIJI)).toEqual({
      south: -21,
      north: -11,
      west: 174,
      east: 184,
    });
  });

  it("holds Fiji and Apia in one short fit across the antimeridian", () => {
    const union = unionBounds(
      placedLocations([FIJI, APIA]).map((place) => place.bounds),
    )!;
    expect(union.west).toBeCloseTo(174);
    expect(union.east).toBeCloseTo(188.3);
    expect(union.south).toBe(-21);
    expect(union.north).toBe(-11);
  });

  it("takes New Zealand's unwrapped 358 degrees as circling the world", () => {
    expect(
      boundsOf({
        latitude: -41,
        longitude: 174,
        bbox_south: -53,
        bbox_north: -29,
        bbox_west: -179.059,
        bbox_east: 179.364,
      }),
    ).toEqual({ south: -53, north: -29, west: 162, east: 186 });
  });

  it("measures a box folded across the antimeridian as the union does", () => {
    expect(
      boundsOf({
        latitude: 0,
        longitude: 0,
        bbox_south: -5,
        bbox_north: 5,
        bbox_west: 5,
        bbox_east: -5,
      }),
    ).toEqual({ south: -5, north: 5, west: -5, east: 5 });
  });

  it("keeps a box given properly across the antimeridian", () => {
    const box = { south: -19, north: -16, west: 177, east: -178 };
    expect(
      boundsOf({
        latitude: -17.7,
        longitude: 179,
        bbox_south: box.south,
        bbox_north: box.north,
        bbox_west: box.west,
        bbox_east: box.east,
      }),
    ).toEqual(box);
  });

  it("draws the line at 350 degrees", () => {
    const wide = (east: number) =>
      boundsOf({
        latitude: 0,
        longitude: 10,
        bbox_south: -2,
        bbox_north: 2,
        bbox_west: -170,
        bbox_east: east,
      });
    expect(wide(179.9)).toEqual({
      south: -2,
      north: 2,
      west: -170,
      east: 179.9,
    });
    expect(wide(180)).toEqual({ south: -2, north: 2, west: 8, east: 12 });
  });

  it("takes a width from a box whose south and north arrive swapped", () => {
    expect(
      boundsOf({ ...FIJI, bbox_south: -11, bbox_north: -21 }),
    ).toMatchObject({ west: 174, east: 184 });
  });

  it("fits a place with no box as its own point", () => {
    expect(boundsOf({ latitude: 28.5, longitude: 34.5 })).toEqual({
      south: 28.5,
      north: 28.5,
      west: 34.5,
      east: 34.5,
    });
  });
});
