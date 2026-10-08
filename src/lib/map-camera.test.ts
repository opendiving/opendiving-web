import { describe, expect, it } from "vitest";

import { MAX_FIT_ZOOM, MIN_ZOOM } from "@/lib/basemap";
import {
  frameCamera,
  projectFrom,
  tileLayout,
  type MapFrame,
} from "@/lib/map-camera";
import { bandIn, mapCanvas, placedLocations } from "@/lib/map-frame";
import { tileCenter, TILE_SIZE } from "@/lib/map-grid";

// The arithmetic a card and a hero compose their maps with, short of any
// layout: which tiles a frame asks for, where they and the pins go, and that
// nothing past the grid is asked for. Whether the fit agrees with GL JS is
// `map-camera.browser.test.ts`'s question, and whether the composed map lands
// where it should in a real card is `card-frames.browser.test.tsx`'s.

const card = (width: number, height = 236): MapFrame => ({
  width,
  height,
  band: bandIn(height, 20, 80),
  inset: mapCanvas(width, false).inset,
});

const BLUE_HOLE = placedLocations([
  { name: "Blue Hole", latitude: 28.5721, longitude: 34.5372 },
]);

// What `area` covers, relative to the camera's centre, in a frame showing the
// centre at `anchor`.
const whole = (frame: MapFrame, anchor: { x: number; y: number }) => ({
  left: -anchor.x,
  top: -anchor.y,
  right: frame.width - anchor.x,
  bottom: frame.height - anchor.y,
});

describe("frameCamera", () => {
  it("opens a lone place at the deepest a map is fitted at", () => {
    expect(frameCamera(BLUE_HOLE, card(252)).zoom).toBe(MAX_FIT_ZOOM);
  });

  it("shows nothing placed as the whole world, on the equator", () => {
    expect(frameCamera([], card(252))).toEqual({
      center: { latitude: 0, longitude: 0 },
      zoom: MIN_ZOOM,
    });
  });

  it("keeps the antimeridian at the edges when asked", () => {
    const places = placedLocations([
      { latitude: 9.9, longitude: 123.4 }, // Moalboal
      { latitude: 28.5, longitude: 34.5 }, // Dahab
      { latitude: 22.9, longitude: -109.9 }, // Cabo San Lucas
    ]);
    const frame = card(1280, 352);
    // Unwrapped against Moalboal, Cabo San Lucas lies across the Pacific...
    expect(
      Math.abs(frameCamera(places, frame).center.longitude),
    ).toBeGreaterThan(90);
    // ...and a world map's way is across the Atlantic.
    expect(
      Math.abs(
        frameCamera(places, frame, { antimeridianAtEdges: true }).center
          .longitude,
      ),
    ).toBeLessThan(90);
  });

  it("fits a wider frame at least as deep as a narrower one", () => {
    const places = placedLocations([
      { latitude: 28.5721, longitude: 34.5372 },
      { latitude: 27.2579, longitude: 33.8116 },
    ]);
    expect(frameCamera(places, card(975)).zoom).toBeGreaterThanOrEqual(
      frameCamera(places, card(252)).zoom,
    );
  });
});

describe("tileLayout", () => {
  it("floors the zoom to a whole one, within the zooms tiles are drawn at", () => {
    const area = { left: -100, top: -100, right: 100, bottom: 100 };
    const at = (zoom: number) =>
      tileLayout({ center: { latitude: 0, longitude: 0 }, zoom }, area).zoom;
    expect(at(6.9)).toBe(6);
    expect(at(9)).toBe(9);
    expect(at(-1.2)).toBe(MIN_ZOOM);
    expect(at(12)).toBe(MAX_FIT_ZOOM);
  });

  it("covers the whole area with tiles that meet, and asks for no more", () => {
    const frame = card(536);
    const anchor = { x: 268, y: 90 };
    const area = whole(frame, anchor);
    const { tiles } = tileLayout(frameCamera(BLUE_HOLE, frame), area);

    for (const { left, top } of tiles) {
      // Every tile reaches into the area.
      expect(left + TILE_SIZE).toBeGreaterThan(area.left);
      expect(left).toBeLessThan(area.right);
      expect(top + TILE_SIZE).toBeGreaterThan(area.top);
      expect(top).toBeLessThan(area.bottom);
    }
    // And every pixel of the area is under one of them.
    for (let x = area.left; x < area.right; x += 7) {
      for (let y = area.top; y < area.bottom; y += 7) {
        expect(
          tiles.some(
            ({ left, top }) =>
              x >= left &&
              x < left + TILE_SIZE &&
              y >= top &&
              y < top + TILE_SIZE,
          ),
        ).toBe(true);
      }
    }
    // A list card on a coast is at most three tiles by two.
    expect(tiles.length).toBeLessThanOrEqual(6);
  });

  it("names the tiles of one place at one size the same, whoever asks", () => {
    const frame = card(252);
    const area = whole(frame, { x: 126, y: 90 });
    const once = tileLayout(frameCamera(BLUE_HOLE, frame), area);
    const twice = tileLayout(frameCamera(BLUE_HOLE, frame), area);
    expect(twice).toEqual(once);
    expect(once.tiles.map(({ z, x, y }) => `${z}/${x}/${y}`)).toContain(
      "9/305/213",
    );
  });

  it("wraps a column past the antimeridian onto the grid", () => {
    // Fiji and Samoa, across the antimeridian.
    const places = placedLocations([
      { latitude: -18.1416, longitude: 178.4419 },
      { latitude: -13.8333, longitude: -171.7667 },
    ]);
    const frame = card(975);
    const layout = tileLayout(
      frameCamera(places, frame),
      whole(frame, { x: 488, y: 90 }),
    );
    const columns = new Set(layout.tiles.map(({ x }) => x));
    const last = 2 ** layout.zoom - 1;
    expect(columns).toContain(0);
    expect(columns).toContain(last);
    for (const { x } of layout.tiles) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(last);
    }
  });

  it("asks for no row past the world's top or bottom edge", () => {
    // The whole world, under a frame taller than it is at zoom 0.
    const frame = card(1024, 700);
    const layout = tileLayout(
      frameCamera([], frame),
      whole(frame, { x: 512, y: 350 }),
    );
    expect(layout.zoom).toBe(0);
    expect(new Set(layout.tiles.map(({ y }) => y))).toEqual(new Set([0]));
    // The one tile of the world, once per copy across the frame.
    expect(new Set(layout.tiles.map(({ x }) => x))).toEqual(new Set([0]));
    expect(layout.tiles.length).toBeGreaterThan(1);
  });

  it("puts every tile on whole pixels", () => {
    const frame = card(333);
    const layout = tileLayout(
      frameCamera(BLUE_HOLE, frame),
      whole(frame, { x: 167, y: 90 }),
    );
    for (const { left, top } of layout.tiles) {
      expect(Number.isInteger(left)).toBe(true);
      expect(Number.isInteger(top)).toBe(true);
    }
  });
});

describe("projectFrom", () => {
  it("puts the camera's centre where the frame shows it", () => {
    const camera = {
      center: { latitude: 28.5721, longitude: 34.5372 },
      zoom: 9,
    };
    const layout = tileLayout(camera, {
      left: -10,
      top: -10,
      right: 10,
      bottom: 10,
    });
    const { left, top } = projectFrom(layout, camera.center);
    expect(Math.abs(left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(top)).toBeLessThanOrEqual(0.5);
  });

  it("keeps a place beside the antimeridian on the copy nearest the centre", () => {
    const layout = tileLayout(
      { center: { latitude: -16, longitude: -176.7 }, zoom: 4 },
      { left: -10, top: -10, right: 10, bottom: 10 },
    );
    const fiji = projectFrom(layout, { latitude: -18.14, longitude: 178.44 });
    const samoa = projectFrom(layout, { latitude: -13.83, longitude: -171.77 });
    expect(fiji.left).toBeLessThan(0);
    expect(samoa.left).toBeGreaterThan(0);
    // A few degrees apart, not a world.
    expect(samoa.left - fiji.left).toBeLessThan(TILE_SIZE);
  });
});

describe("tileCenter", () => {
  it("is the middle of the tile, which projects into it", () => {
    const middle = tileCenter(9, 305, 213);
    const layout = tileLayout(
      { center: middle, zoom: 9 },
      { left: -1, top: -1, right: 1, bottom: 1 },
    );
    expect(layout.tiles).toEqual([
      { z: 9, x: 305, y: 213, left: -256, top: -256 },
    ]);
  });

  it("is the world's middle at zoom 0", () => {
    const { latitude, longitude } = tileCenter(0, 0, 0);
    expect(latitude).toBeCloseTo(0, 9);
    expect(longitude).toBe(0);
  });
});
