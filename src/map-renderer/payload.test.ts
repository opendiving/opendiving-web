import { describe, expect, it } from "vitest";

import { MAX_FIT_ZOOM } from "@/lib/basemap";
import { parsePayload, PayloadError } from "./payload";

const TILE = { kind: "tile", theme: "light", z: 9, x: 300, y: 215 };

function rejects(body: unknown, message: RegExp) {
  expect(() => parsePayload(body)).toThrow(PayloadError);
  expect(() => parsePayload(body)).toThrow(message);
}

describe("parsePayload", () => {
  it("takes a tile in either theme", () => {
    expect(parsePayload(TILE)).toEqual(TILE);
    expect(parsePayload({ ...TILE, theme: "dark" })).toEqual({
      ...TILE,
      theme: "dark",
    });
  });

  it("takes the corners of the grid at every zoom it draws", () => {
    for (let z = 0; z <= MAX_FIT_ZOOM; z += 1) {
      const last = 2 ** z - 1;
      expect(parsePayload({ ...TILE, z, x: 0, y: 0 })).toMatchObject({ z });
      expect(parsePayload({ ...TILE, z, x: last, y: last })).toMatchObject({
        x: last,
        y: last,
      });
    }
  });

  // The deepest any of the web's maps is fitted at, and the API's ceiling too.
  it("refuses a zoom past the deepest a map is fitted at", () => {
    expect(MAX_FIT_ZOOM).toBe(9);
    rejects({ ...TILE, z: 10, x: 0, y: 0 }, /z must be from 0 to 9/);
    rejects({ ...TILE, z: -1 }, /z must be from 0 to 9/);
  });

  it("refuses a square outside the grid", () => {
    rejects({ ...TILE, x: 512 }, /x must be from 0 to 511/);
    rejects({ ...TILE, y: 512 }, /y must be from 0 to 511/);
    rejects({ ...TILE, z: 0, x: 1, y: 0 }, /x must be from 0 to 0/);
    rejects({ ...TILE, x: -1 }, /x must be from 0/);
  });

  it("refuses coordinates that are not integers", () => {
    rejects({ ...TILE, x: 1.5 }, /x must be an integer/);
    rejects({ ...TILE, z: "9" }, /z must be an integer/);
    rejects({ ...TILE, y: null }, /y must be an integer/);
  });

  it("refuses a body naming a record's places", () => {
    rejects(
      {
        kind: "dive",
        theme: "light",
        dive_sites: [{ latitude: 28.5721, longitude: 34.5372 }],
        entry_latitude: null,
        entry_longitude: null,
        exit_latitude: null,
        exit_longitude: null,
      },
      /missing z, x, y/,
    );
    rejects({ ...TILE, kind: "trip" }, /kind must be "tile"/);
  });

  it("refuses a missing key and an extra one alike", () => {
    const { y: _y, ...missing } = TILE;
    rejects(missing, /missing y/);
    rejects({ ...TILE, account: "someone" }, /unexpected account/);
  });

  it("refuses a theme it does not draw, and a body that is not an object", () => {
    rejects({ ...TILE, theme: "sepia" }, /theme/);
    rejects([TILE], /object/);
    rejects(null, /object/);
  });
});
