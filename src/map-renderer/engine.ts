// The drawing itself: a MapLibre Native map per tile, and the WebP the API
// stores.

import sharp from "sharp";

import { tileCenter, TILE_SIZE } from "@/lib/map-grid";
import type { Theme, TilePayload } from "./payload";
import type { Resources } from "./resources";
import { loadStyle, type RendererConfig } from "./style";

// Ratio 2, so a tile is sharp on the screens that show most of them: a 512 CSS
// px square, 1024 pixels across.
export const PIXEL_RATIO = 2;

// From the moment a draw starts, not from when it was queued. Long past a slow
// cold render; a map still drawing by then is a map that is not going to finish.
export const RENDER_DEADLINE_MS = 30_000;

// A style, and a source's TileJSON, are read again after an hour. OpenFreeMap
// names each week's tiles by date in its TileJSON, and a renderer holding last
// month's names would draw empty land as if the sea had risen.
const DESCRIPTOR_MAX_AGE_MS = 60 * 60 * 1000;
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
}
export interface NativeModule {
  Map: new (options: {
    request: (
      request: NativeRequest,
      callback: (error?: Error | null, response?: { data: Buffer }) => void,
    ) => void;
    ratio: number;
    mode: "tile";
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
  /** Whether a tile can be drawn: both themes' styles load into a map. */
  isReady(): boolean;
  /** One tile, as WebP - or a thrown error, and never a partial image. */
  draw(payload: TilePayload): Promise<Buffer>;
  close(): void;
}

export interface EngineOptions {
  native: NativeModule;
  config: RendererConfig;
  resources: Resources;
  log: (message: string) => void;
  deadlineMs?: number;
}

type StyleDocument = Awaited<ReturnType<typeof loadStyle>>;

export function createEngine({
  native,
  config,
  resources,
  log,
  deadlineMs = RENDER_DEADLINE_MS,
}: EngineOptions): Engine {
  // Encoding one tile at a time is all a render at a time leaves room for, and
  // libvips' operation cache would only hold tiles the API never asks for twice.
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

  const styles = new Map<Theme, StyleDocument>();
  let ready = false;
  let retry: NodeJS.Timeout | undefined;
  let closed = false;
  const drawing = new Set<NativeMap>();

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
        // for that source tile rather than failing the render.
        (data) => (data ? callback(null, { data }) : callback()),
        (error: Error) => callback(error),
      );
  }

  // A style that loaded once and fails to load again is kept: a remote style
  // host having a bad minute is no reason to stop drawing.
  async function styleFor(theme: Theme): Promise<StyleDocument> {
    try {
      const style = await loadStyle(config, theme, resources, {
        maxAgeMs: DESCRIPTOR_MAX_AGE_MS,
      });
      styles.set(theme, style);
      return style;
    } catch (error) {
      const kept = styles.get(theme);
      if (!kept) throw error;
      log(`Drawing on the last ${theme} style: ${(error as Error).message}`);
      return kept;
    }
  }

  // **A map per tile, released as soon as it is drawn.** MapLibre Native keeps
  // the source tiles of every place a map has drawn, up to a cache sized for a
  // map that pans, and offers no way to bound it: a map kept across distinct
  // places grows past a gigabyte. A fresh one costs little once Mesa has
  // compiled its shaders, which `main.ts` lets it keep on disk, and the bytes
  // of every source tile are in `Resources` anyway.
  //
  // `tile` mode renders one square of the grid, and places the labels that
  // cross its edges so that the squares beside it agree.
  //
  // It also means a map whose glyph request once failed - which hangs on its
  // next render (maplibre-native#3169) - is never asked again.
  function newMap(style: object): NativeMap {
    const map = new native.Map({ request, ratio: PIXEL_RATIO, mode: "tile" });
    map.load(style);
    return map;
  }

  function release(map: NativeMap) {
    drawing.delete(map);
    try {
      map.cancel();
    } catch {
      // Nothing was rendering, which is the ordinary case.
    }
    try {
      map.release();
    } catch {
      // Already released.
    }
  }

  // Ready once both themes' styles have loaded and been parsed by a map.
  async function warm() {
    try {
      for (const theme of ["light", "dark"] as const) {
        release(newMap(await styleFor(theme)));
      }
      ready = true;
    } catch (error) {
      log(`Could not load the basemap: ${(error as Error).message}`);
      if (!closed) retry = setTimeout(warm, RETRY_MS);
    }
  }
  void warm();

  // The square at its own zoom, centred on its middle: exactly one tile of the
  // vector source, whose tiles are 512 px too.
  async function render({ theme, z, x, y }: TilePayload): Promise<Uint8Array> {
    const map = newMap(await styleFor(theme));
    const center = tileCenter(z, x, y);
    drawing.add(map);

    try {
      return await new Promise<Uint8Array>((resolve, reject) => {
        const deadline = setTimeout(() => {
          reject(
            new RenderError(
              `The render passed its ${deadlineMs / 1000} s deadline`,
            ),
          );
          // Cancelling answers the render's callback, after the rejection.
          release(map);
        }, deadlineMs);

        map.render(
          {
            zoom: z,
            center: [center.longitude, center.latitude],
            width: TILE_SIZE,
            height: TILE_SIZE,
          },
          (error, pixels) => {
            clearTimeout(deadline);
            if (error || !pixels) {
              reject(new RenderError(error?.message ?? "No image was drawn"));
            } else {
              resolve(pixels);
            }
          },
        );
      });
    } finally {
      release(map);
    }
  }

  return {
    isReady: () => ready,

    async draw(payload) {
      const pixels = await render(payload);
      // Premultiplied, as MapLibre Native hands its pixels back: read as plain
      // RGBA, a translucent edge would come out darker than drawn.
      return sharp(
        Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength),
        {
          raw: {
            width: TILE_SIZE * PIXEL_RATIO,
            height: TILE_SIZE * PIXEL_RATIO,
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
      for (const map of drawing) release(map);
    },
  };
}
