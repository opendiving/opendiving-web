import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SNAPSHOT_HEIGHT, SNAPSHOT_WIDTH } from "@/lib/map-picture";
import { createEngine, PIXEL_RATIO, type NativeModule } from "./engine";
import { parsePayload } from "./payload";
import { PINS_SOURCE } from "./pins";
import { createResources } from "./resources";
import { readRendererConfig } from "./style";

// The engine against a stand-in for MapLibre Native, which records what it is
// asked and answers each render as a test says - so a failed render and one
// that never finishes can be had on purpose. The WebP at the end is real.

const WIDTH = SNAPSHOT_WIDTH * PIXEL_RATIO;
const HEIGHT = SNAPSHOT_HEIGHT * PIXEL_RATIO;

type Answer = "draw" | "fail" | "hang";

interface FakeMap {
  loaded: object[];
  sources: Map<string, object>;
  renders: { zoom: number; center: [number, number] }[];
  cancelled: number;
  released: boolean;
}

function fakeNative(answers: Answer[] = []) {
  const maps: FakeMap[] = [];
  const native: NativeModule = {
    on: () => {},
    Map: class {
      private state: FakeMap = {
        loaded: [],
        sources: new Map(),
        renders: [],
        cancelled: 0,
        released: false,
      };
      private pending?: (error: Error) => void;
      constructor() {
        maps.push(this.state);
      }
      load(style: object) {
        this.state.loaded.push(style);
      }
      addSource(id: string, source: object) {
        this.state.sources.set(id, source);
      }
      removeSource(id: string) {
        this.state.sources.delete(id);
      }
      addLayer() {}
      removeLayer() {}
      render(
        options: { zoom: number; center: [number, number] },
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
            : callback(null, new Uint8Array(WIDTH * HEIGHT * 4).fill(200)),
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

const DIVE = parsePayload({
  kind: "dive",
  theme: "light",
  dive_sites: [{ latitude: 28.5721, longitude: 34.5372 }],
  entry_latitude: null,
  entry_longitude: null,
  exit_latitude: 28.5689,
  exit_longitude: 34.5355,
});

let close: (() => void) | undefined;
afterEach(() => close?.());

async function engineWith(
  answers?: Answer[],
  options: { deadlineMs?: number; maxPicturesPerMap?: number } = {},
) {
  const { native, maps } = fakeNative(answers);
  const engine = createEngine({
    native,
    config,
    resources,
    log: () => {},
    ...options,
  });
  close = () => engine.close();
  await vi.waitFor(() => expect(engine.isReady()).toBe(true));
  return { engine, maps };
}

describe("the engine", () => {
  it("builds one map per theme from the vendored styles, pins layered on top", async () => {
    const { maps } = await engineWith();
    expect(maps).toHaveLength(2);
    for (const map of maps) {
      const [style] = map.loaded as { layers: { id: string }[] }[];
      expect(style.layers[style.layers.length - 1].id).toBe("opendiving-pins");
    }
  });

  it("draws a 2048x1024 WebP of the payload's places", async () => {
    const { engine, maps } = await engineWith();
    const picture = await engine.draw(DIVE);

    const { format, width, height } = await sharp(picture).metadata();
    expect({ format, width, height }).toEqual({
      format: "webp",
      width: WIDTH,
      height: HEIGHT,
    });
    const light = maps.find((map) => map.renders.length > 0)!;
    expect(light.renders[0].zoom).toBe(9);
    const pins = light.sources.get(PINS_SOURCE) as {
      data: { features: { properties: { variant: string } }[] };
    };
    expect(pins.data.features.map((pin) => pin.properties.variant)).toEqual([
      "pin",
      "fix",
    ]);
  });

  // A map whose glyph request once failed hangs on its next render
  // (maplibre-native#3169), so it is never asked again.
  it("gives up a map whose render failed, and draws the next on a new one", async () => {
    const { engine, maps } = await engineWith(["fail"]);
    await expect(engine.draw(DIVE)).rejects.toThrow(/glyphs/);
    const failed = maps.find((map) => map.renders.length === 1)!;
    expect(failed.released).toBe(true);

    await engine.draw(DIVE);
    expect(maps).toHaveLength(3);
    expect(maps[2].renders).toHaveLength(1);
  });

  it("cancels and gives up a render that passes its deadline", async () => {
    const { engine, maps } = await engineWith(["hang"], { deadlineMs: 50 });
    await expect(engine.draw(DIVE)).rejects.toThrow(/deadline/);
    const hung = maps.find((map) => map.renders.length === 1)!;
    expect(hung.cancelled).toBe(1);
    expect(hung.released).toBe(true);

    expect((await engine.draw(DIVE)).length).toBeGreaterThan(0);
  });

  it("retires a map after so many pictures", async () => {
    const { engine, maps } = await engineWith([], { maxPicturesPerMap: 3 });
    for (let picture = 0; picture < 4; picture += 1) {
      await engine.draw(DIVE);
    }
    const light = maps.filter((map) => map.renders.length > 0);
    expect(light.map((map) => map.renders.length)).toEqual([3, 1]);
    expect(light[0].released).toBe(true);
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
    await expect(engine.draw(DIVE)).rejects.toThrow(/502/);
  });
});
