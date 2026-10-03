import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { tileCenter, TILE_SIZE } from "@/lib/map-camera";
import { createEngine, PIXEL_RATIO, type NativeModule } from "./engine";
import { parsePayload } from "./payload";
import { createResources } from "./resources";
import { readRendererConfig } from "./style";

// The engine against a stand-in for MapLibre Native, which records what it is
// asked and answers each render as a test says - so a failed render and one
// that never finishes can be had on purpose. The WebP at the end is real.

const SIDE = TILE_SIZE * PIXEL_RATIO;

type Answer = "draw" | "fail" | "hang";

interface FakeMap {
  options: { ratio: number; mode: string };
  loaded: {
    sources: Record<string, unknown>;
    layers: { id: string }[];
  }[];
  renders: {
    zoom: number;
    center: [number, number];
    width: number;
    height: number;
  }[];
  cancelled: number;
  released: boolean;
}

function fakeNative(answers: Answer[] = []) {
  const maps: FakeMap[] = [];
  const native: NativeModule = {
    on: () => {},
    Map: class {
      private state: FakeMap;
      private pending?: (error: Error) => void;
      constructor(options: FakeMap["options"]) {
        this.state = {
          options: { ratio: options.ratio, mode: options.mode },
          loaded: [],
          renders: [],
          cancelled: 0,
          released: false,
        };
        maps.push(this.state);
      }
      load(style: FakeMap["loaded"][number]) {
        this.state.loaded.push(style);
      }
      render(
        options: FakeMap["renders"][number],
        callback: (error: Error | null, pixels?: Uint8Array) => void,
      ) {
        this.state.renders.push(options);
        const answer = answers.shift() ?? "draw";
        if (answer === "hang") {
          this.pending = callback;
          return;
        }
        setTimeout(() =>
          answer === "fail"
            ? callback(new Error("Failed to load glyphs"))
            : callback(null, new Uint8Array(SIDE * SIDE * 4).fill(200)),
        );
      }
      cancel() {
        if (!this.pending) throw new Error("No render in progress");
        this.state.cancelled += 1;
        const pending = this.pending;
        this.pending = undefined;
        pending(new Error("Canceled"));
      }
      release() {
        if (this.state.released) {
          throw new Error("Map resources have already been released");
        }
        this.state.released = true;
      }
    } as unknown as NativeModule["Map"],
  };
  return { native, maps };
}

const config = readRendererConfig({ SITE_URL: "https://dives.example.com" });
const resources = createResources({
  siteUrl: config.siteUrl,
  publicDir: path.resolve("public"),
});

// The tile over Dahab at the deepest zoom a map is fitted at.
const TILE = parsePayload({
  kind: "tile",
  theme: "light",
  z: 9,
  x: 305,
  y: 215,
});

let close: (() => void) | undefined;
afterEach(() => close?.());

async function engineWith(answers?: Answer[], deadlineMs?: number) {
  const { native, maps } = fakeNative(answers);
  const engine = createEngine({
    native,
    config,
    resources,
    log: () => {},
    deadlineMs,
  });
  close = () => engine.close();
  await vi.waitFor(() => expect(engine.isReady()).toBe(true));
  // The two the engine parsed both themes' styles with, to become ready.
  expect(maps).toHaveLength(2);
  return { engine, maps, drawn: () => maps.slice(2) };
}

describe("the engine", () => {
  it("is ready once a map has loaded both themes' styles", async () => {
    const { maps } = await engineWith();
    expect(maps.every((map) => map.loaded.length === 1)).toBe(true);
    expect(maps.every((map) => map.released)).toBe(true);
  });

  it("draws a 1024x1024 WebP of the tile, once, at its middle and its zoom", async () => {
    const { engine, drawn } = await engineWith();
    const tile = await engine.draw(TILE);

    const { format, width, height } = await sharp(tile).metadata();
    expect({ format, width, height }).toEqual({
      format: "webp",
      width: 1024,
      height: 1024,
    });

    const [map] = drawn();
    expect(map.options).toEqual({ ratio: 2, mode: "tile" });
    const middle = tileCenter(9, 305, 215);
    expect(map.renders).toEqual([
      {
        zoom: 9,
        center: [middle.longitude, middle.latitude],
        width: 512,
        height: 512,
      },
    ]);
  });

  // Nothing of any record: the style as loaded, with no source or layer of
  // this app's own.
  it("draws the theme's style as it loaded, and nothing over it", async () => {
    const { engine, maps, drawn } = await engineWith();
    await engine.draw({ ...TILE, theme: "dark" });

    const [, darkWarm] = maps;
    const [style] = drawn()[0].loaded;
    expect(style).toEqual(darkWarm.loaded[0]);
  });

  // MapLibre Native keeps every source tile a map has drawn, so a map is never
  // kept past its tile.
  it("draws every tile on a map of its own, and lets it go", async () => {
    const { engine, drawn } = await engineWith();
    await engine.draw(TILE);
    await engine.draw(TILE);
    expect(drawn()).toHaveLength(2);
    expect(drawn().every((map) => map.released)).toBe(true);
  });

  it("answers a failed render with an error, and lets its map go", async () => {
    const { engine, drawn } = await engineWith(["fail"]);
    await expect(engine.draw(TILE)).rejects.toThrow(/glyphs/);
    expect(drawn()[0].released).toBe(true);
    expect((await engine.draw(TILE)).length).toBeGreaterThan(0);
  });

  it("cancels and lets go a render that passes its deadline", async () => {
    const { engine, drawn } = await engineWith(["hang"], 50);
    await expect(engine.draw(TILE)).rejects.toThrow(/deadline/);
    const [hung] = drawn();
    expect(hung.cancelled).toBe(1);
    expect(hung.released).toBe(true);

    expect((await engine.draw(TILE)).length).toBeGreaterThan(0);
  });

  it("is not ready while its basemap cannot load", async () => {
    const { native } = fakeNative();
    const engine = createEngine({
      native,
      config: readRendererConfig({
        SITE_URL: "https://dives.example.com",
        MAP_STYLE_URL: "https://maps.example.invalid/style.json",
        MAP_ATTRIBUTION: "© Nobody",
      }),
      resources: createResources({
        siteUrl: config.siteUrl,
        publicDir: path.resolve("public"),
        fetch: async () => new Response("Down", { status: 502 }),
      }),
      log: () => {},
    });
    close = () => engine.close();
    await new Promise((done) => setTimeout(done, 20));
    expect(engine.isReady()).toBe(false);
    await expect(engine.draw(TILE)).rejects.toThrow(/502/);
  });
});
