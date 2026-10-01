// The drawing itself: one MapLibre Native map per theme, a picture at a time on
// each, and the WebP the API stores.

import sharp from "sharp";

import { SNAPSHOT_HEIGHT, SNAPSHOT_WIDTH } from "@/lib/map-picture";
import { pictureCamera } from "./camera";
import {
  payloadFrame,
  payloadPlaces,
  type RenderPayload,
  type Theme,
} from "./payload";
import { PIN_LAYER_IDS, PINS_SOURCE, pinLayers, pinsSource } from "./pins";
import type { Resources } from "./resources";
import { loadStyle, type RendererConfig } from "./style";

// Ratio 2, so a picture is sharp on the screens that show most of them.
export const PIXEL_RATIO = 2;

// From the moment a draw starts, not from when it was queued. Long past a slow
// cold render; a map still drawing by then is a map that is not going to finish.
export const RENDER_DEADLINE_MS = 30_000;

// A map is retired after this many pictures or this long, whichever comes
// first, and the next picture builds a fresh one. That is what keeps MapLibre's
// own caches from growing with every place drawn, and what makes a map re-read
// its source's TileJSON - OpenFreeMap names each week's tiles by date, and a map
// holding last month's names would draw empty tiles as if the sea had risen.
export const MAX_PICTURES_PER_MAP = 100;
const MAX_MAP_AGE_MS = 60 * 60 * 1000;
// A style and a TileJSON are re-read on the same clock as a map.
const DESCRIPTOR_MAX_AGE_MS = MAX_MAP_AGE_MS;
const RETRY_MS = 30_000;

// MapLibre Native's `Resource::Kind` for a source's TileJSON.
const SOURCE_KIND = 2;

// What this file uses of `@maplibre/maplibre-gl-native`. Its own typings lack
// `cancel` and the module's event emitter, so this says what is relied on
// rather than trusting a declaration that is incomplete.
interface NativeRequest {
  url: string;
  kind: number;
}
interface NativeMap {
  load(style: object): void;
  render(
    options: {
      zoom: number;
      center: [number, number];
      width: number;
      height: number;
    },
    callback: (error: Error | null | undefined, pixels?: Uint8Array) => void,
  ): void;
  cancel(): void;
  release(): void;
  addSource(id: string, source: object): void;
  removeSource(id: string): void;
  addLayer(layer: object): void;
  removeLayer(id: string): void;
}
export interface NativeModule {
  Map: new (options: {
    request: (
      request: NativeRequest,
      callback: (error?: Error | null, response?: { data: Buffer }) => void,
    ) => void;
    ratio: number;
    mode: "static";
  }) => NativeMap;
  on(
    event: "message",
    listener: (message: {
      severity: string;
      class: string;
      text: string;
    }) => void,
  ): void;
}

export class RenderError extends Error {}

export interface Engine {
  /** Whether both themes' maps can be built: their styles have loaded. */
  isReady(): boolean;
  /** One picture, as WebP - or a thrown error, and never a partial image. */
  draw(payload: RenderPayload): Promise<Buffer>;
  close(): void;
}

interface Slot {
  map: NativeMap;
  pictures: number;
  createdAt: number;
}

export interface EngineOptions {
  native: NativeModule;
  config: RendererConfig;
  resources: Resources;
  log: (message: string) => void;
  deadlineMs?: number;
  maxPicturesPerMap?: number;
}

export function createEngine({
  native,
  config,
  resources,
  log,
  deadlineMs = RENDER_DEADLINE_MS,
  maxPicturesPerMap = MAX_PICTURES_PER_MAP,
}: EngineOptions): Engine {
  // Encoding one picture at a time is all a render at a time leaves room for,
  // and libvips' operation cache would only hold pictures nobody asks for twice.
  sharp.cache(false);
  sharp.concurrency(1);

  // A warning said once: MapLibre repeats one for every tile it meets it in.
  const warned = new Set<string>();
  native.on("message", ({ severity, class: kind, text }) => {
    const line = `MapLibre ${severity.toLowerCase()} (${kind}): ${text}`;
    if (severity === "ERROR") {
      log(line);
    } else if (severity === "WARNING" && !warned.has(line)) {
      if (warned.size < 100) warned.add(line);
      log(line);
    }
  });

  const styles = new Map<Theme, object>();
  const slots = new Map<Theme, Slot>();
  let retry: NodeJS.Timeout | undefined;
  let closed = false;

  function request(
    { url, kind }: NativeRequest,
    callback: (error?: Error | null, response?: { data: Buffer }) => void,
  ) {
    resources
      .get(
        url,
        kind === SOURCE_KIND ? { maxAgeMs: DESCRIPTOR_MAX_AGE_MS } : undefined,
      )
      .then(
        // No arguments at all is MapLibre's "no content", which draws nothing
        // for that tile rather than failing the picture.
        (data) => (data ? callback(null, { data }) : callback()),
        (error: Error) => callback(error),
      );
  }

  // A style that loaded once and fails to load again is kept: a remote style
  // host having a bad minute is no reason to stop drawing.
  async function styleFor(theme: Theme): Promise<object> {
    let style;
    try {
      style = await loadStyle(config, theme, resources, {
        maxAgeMs: DESCRIPTOR_MAX_AGE_MS,
      });
    } catch (error) {
      const kept = styles.get(theme);
      if (!kept) throw error;
      log(`Drawing on the last ${theme} style: ${(error as Error).message}`);
      return kept;
    }
    // The pins' source and layers exist from the start, empty, so each picture
    // replaces them rather than first asking whether they are there.
    const document = {
      ...style,
      sources: { ...style.sources, [PINS_SOURCE]: pinsSource([]) },
      layers: [...style.layers, ...pinLayers(theme)],
    };
    styles.set(theme, document);
    return document;
  }

  const building = new Map<Theme, Promise<Slot>>();
  function slotFor(theme: Theme): Promise<Slot> {
    const kept = slots.get(theme);
    if (kept) return Promise.resolve(kept);
    let pending = building.get(theme);
    if (!pending) {
      pending = styleFor(theme)
        .then((style) => {
          const map = new native.Map({
            request,
            ratio: PIXEL_RATIO,
            mode: "static",
          });
          map.load(style);
          const slot = { map, pictures: 0, createdAt: Date.now() };
          slots.set(theme, slot);
          return slot;
        })
        .finally(() => building.delete(theme));
      building.set(theme, pending);
    }
    return pending;
  }

  // Never reused once it has failed or been given up on: a map whose glyph
  // request once failed hangs on its next render (maplibre-native#3169).
  function retire(theme: Theme, slot: Slot) {
    if (slots.get(theme) === slot) slots.delete(theme);
    try {
      slot.map.cancel();
    } catch {
      // Nothing was rendering, which is the ordinary case.
    }
    try {
      slot.map.release();
    } catch {
      // Already released.
    }
  }

  async function warm() {
    try {
      await Promise.all((["light", "dark"] as const).map(slotFor));
    } catch (error) {
      log(`Could not load the basemap: ${(error as Error).message}`);
      if (!closed) retry = setTimeout(warm, RETRY_MS);
    }
  }
  void warm();

  async function render(payload: RenderPayload): Promise<Uint8Array> {
    const slot = await slotFor(payload.theme);
    const placed = payloadPlaces(payload);
    const { center, zoom } = pictureCamera(placed, payloadFrame(payload));

    for (const id of [...PIN_LAYER_IDS].reverse()) slot.map.removeLayer(id);
    slot.map.removeSource(PINS_SOURCE);
    slot.map.addSource(PINS_SOURCE, pinsSource(placed));
    for (const layer of pinLayers(payload.theme)) slot.map.addLayer(layer);

    return new Promise((resolve, reject) => {
      let settled = false;
      const deadline = setTimeout(() => {
        settled = true;
        retire(payload.theme, slot);
        reject(
          new RenderError(
            `The render passed its ${deadlineMs / 1000} s deadline`,
          ),
        );
      }, deadlineMs);

      slot.map.render(
        {
          zoom,
          center: [center.longitude, center.latitude],
          width: SNAPSHOT_WIDTH,
          height: SNAPSHOT_HEIGHT,
        },
        (error, pixels) => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          if (error || !pixels) {
            retire(payload.theme, slot);
            reject(new RenderError(error?.message ?? "No image was drawn"));
            return;
          }
          slot.pictures += 1;
          if (
            slot.pictures >= maxPicturesPerMap ||
            Date.now() - slot.createdAt >= MAX_MAP_AGE_MS
          ) {
            retire(payload.theme, slot);
          }
          resolve(pixels);
        },
      );
    });
  }

  return {
    isReady: () => styles.has("light") && styles.has("dark"),

    async draw(payload) {
      const pixels = await render(payload);
      // Premultiplied, as MapLibre Native hands its pixels back: read as plain
      // RGBA, a translucent edge would come out darker than drawn.
      return sharp(
        Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength),
        {
          raw: {
            width: SNAPSHOT_WIDTH * PIXEL_RATIO,
            height: SNAPSHOT_HEIGHT * PIXEL_RATIO,
            channels: 4,
            premultiplied: true,
          },
        },
      )
        .webp({ quality: 90 })
        .toBuffer();
    },

    close() {
      closed = true;
      clearTimeout(retry);
      for (const [theme, slot] of slots) retire(theme, slot);
    },
  };
}
