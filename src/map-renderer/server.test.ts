import type { AddressInfo } from "node:net";
import { request as httpRequest, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import type { LabelLanguage, Theme, TilePayload } from "./payload";
import { createRendererServer, QUEUE_LIMIT, type Renderer } from "./server";

// The server driven over real HTTP with the contract's own bodies, and a
// stand-in for the drawing so the queue can be held full on purpose.

const SIGNATURE = "a".repeat(64);
const ATTRIBUTION =
  "[OpenFreeMap](https://openfreemap.org/) © [OpenStreetMap](https://www.openstreetmap.org/copyright)";
const IMAGE = Buffer.from("RIFF....WEBPVP8 ");
const STYLE = { version: 8, sources: {}, layers: [] };

const TILE = { kind: "tile", theme: "light", z: 9, x: 300, y: 215 };
const DARK_TILE = { kind: "tile", theme: "dark", z: 0, x: 0, y: 0 };

interface Stub extends Renderer {
  healthy: boolean;
  /** How many times the server asked, which it does as it admits a draw. */
  checks: number;
  drawn: TilePayload[];
  /** Holds every draw until `release` is called, when set. */
  hold: boolean;
  release(): void;
  fail: boolean;
  /** What each style answer was asked for. */
  styled: [Theme, LabelLanguage | undefined][];
  /** Holds every style answer until the promise it is set to settles. */
  styleGate: Promise<void>;
  styleFails: boolean;
}

function stubRenderer(): Stub {
  let waiting: (() => void)[] = [];
  const stub: Stub = {
    healthy: true,
    checks: 0,
    drawn: [],
    hold: false,
    fail: false,
    styled: [],
    styleGate: Promise.resolve(),
    styleFails: false,
    isHealthy: () => {
      stub.checks += 1;
      return stub.healthy;
    },
    async draw(payload) {
      if (stub.hold) await new Promise<void>((done) => waiting.push(done));
      stub.drawn.push(payload);
      if (stub.fail) throw new Error("the provider answered 500");
      return IMAGE;
    },
    async style(theme, language) {
      stub.styled.push([theme, language]);
      await stub.styleGate;
      if (stub.styleFails) throw new Error("the provider answered 500");
      return STYLE;
    },
    release() {
      const pending = waiting;
      waiting = [];
      pending.forEach((done) => done());
    },
  };
  return stub;
}

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((done) => server?.close(done) ?? done(null));
  server = undefined;
});

async function serve(renderer: Renderer, queueLimit?: number) {
  server = createRendererServer({
    renderer,
    signature: SIGNATURE,
    attribution: ATTRIBUTION,
    queueLimit,
  });
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const render = (base: string, body: unknown, type = "application/json") =>
  fetch(`${base}/render`, {
    method: "POST",
    headers: { "Content-Type": type },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("the renderer's server", () => {
  it("answers /healthz with whether it can render", async () => {
    const renderer = stubRenderer();
    const base = await serve(renderer);
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    renderer.healthy = false;
    expect((await fetch(`${base}/healthz`)).status).toBe(503);
  });

  it("answers /signature with the signature it draws with and the basemap's credit", async () => {
    const base = await serve(stubRenderer());
    const response = await fetch(`${base}/signature`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({
      signature: SIGNATURE,
      attribution: ATTRIBUTION,
    });
  });

  it("draws a tile in either theme, naming the signature it drew with", async () => {
    const renderer = stubRenderer();
    const base = await serve(renderer);

    for (const body of [TILE, DARK_TILE]) {
      const response = await render(base, body);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/webp");
      expect(response.headers.get("x-map-signature")).toBe(SIGNATURE);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(IMAGE);
    }
    expect(renderer.drawn).toEqual([TILE, DARK_TILE]);
  });

  it("draws a tile in a language, and logs it with its square", async () => {
    const lines: string[] = [];
    const renderer = stubRenderer();
    server = createRendererServer({
      renderer,
      signature: SIGNATURE,
      attribution: ATTRIBUTION,
      log: (line) => lines.push(line),
    });
    await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    expect((await render(base, { ...TILE, language: "de" })).status).toBe(200);
    expect(renderer.drawn).toEqual([{ ...TILE, language: "de" }]);
    expect(lines).toEqual([
      expect.stringMatching(/^drew a tile, light 9\/300\/215 in de, in \d+ ms/),
    ]);
  });

  it("logs each tile it draws by its square", async () => {
    const lines: string[] = [];
    server = createRendererServer({
      renderer: stubRenderer(),
      signature: SIGNATURE,
      attribution: ATTRIBUTION,
      log: (line) => lines.push(line),
    });
    await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await render(base, TILE);

    expect(lines).toEqual([
      expect.stringMatching(/^drew a tile, light 9\/300\/215, in \d+ ms/),
    ]);
  });

  it("takes a JSON content type with a charset", async () => {
    const base = await serve(stubRenderer());
    const response = await render(
      base,
      TILE,
      "application/json; charset=utf-8",
    );
    expect(response.status).toBe(200);
  });

  it("answers 400 for a body that breaks the shape, and draws nothing", async () => {
    const renderer = stubRenderer();
    const base = await serve(renderer);

    for (const [body, type] of [
      [{ ...TILE, name: "Blue Hole" }, "application/json"],
      [{ ...TILE, kind: "dive" }, "application/json"],
      // Past the deepest zoom a map is fitted at, and outside the grid.
      [{ ...TILE, z: 10, x: 0, y: 0 }, "application/json"],
      [{ ...TILE, x: 512 }, "application/json"],
      // A language the basemap does not carry, or one the API left unreduced.
      [{ ...TILE, language: "en" }, "application/json"],
      [{ ...TILE, language: "de-DE" }, "application/json"],
      [{ ...TILE, language: null }, "application/json"],
      [
        {
          kind: "dive",
          theme: "light",
          dive_sites: [{ latitude: 28.5721, longitude: 34.5372 }],
          entry_latitude: null,
          entry_longitude: null,
          exit_latitude: null,
          exit_longitude: null,
        },
        "application/json",
      ],
      ["{not json", "application/json"],
      [JSON.stringify(TILE), "text/plain"],
    ] as const) {
      const response = await render(base, body, type);
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("detail");
    }
    expect(renderer.drawn).toEqual([]);
  });

  it("answers 503 while it cannot render", async () => {
    const renderer = stubRenderer();
    renderer.healthy = false;
    const base = await serve(renderer);
    expect((await render(base, TILE)).status).toBe(503);
    expect(renderer.drawn).toEqual([]);
  });

  it("answers 503, and no partial image, when a draw fails", async () => {
    const renderer = stubRenderer();
    renderer.fail = true;
    const base = await serve(renderer);
    const response = await render(base, TILE);
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("answers 503 once its queue is full, and draws the rest in turn", async () => {
    const renderer = stubRenderer();
    renderer.hold = true;
    const base = await serve(renderer);

    const queued = Array.from({ length: QUEUE_LIMIT }, (_, index) =>
      render(base, { ...TILE, x: index }),
    );
    // Every one of them admitted before the next arrives: the server asks
    // whether it is healthy as it admits each, in the same tick.
    await expect.poll(() => renderer.checks).toBe(QUEUE_LIMIT);

    const turnedAway = await render(base, TILE);
    expect(turnedAway.status).toBe(503);
    expect(await turnedAway.json()).toEqual({
      detail: "The renderer's queue is full",
    });

    renderer.release();
    // Released one at a time, since each draw waits for the one before it.
    const timer = setInterval(() => renderer.release(), 5);
    const responses = await Promise.all(queued);
    clearInterval(timer);
    expect(responses.map((response) => response.status)).toEqual(
      Array(QUEUE_LIMIT).fill(200),
    );
    expect(renderer.drawn.map((payload) => payload.x)).toEqual(
      Array.from({ length: QUEUE_LIMIT }, (_, index) => index),
    );

    // And room again once they are done.
    renderer.hold = false;
    expect((await render(base, TILE)).status).toBe(200);
  });

  it("skips a queued draw whose client has gone", async () => {
    const renderer = stubRenderer();
    renderer.hold = true;
    const base = await serve(renderer);

    const first = render(base, TILE);
    await new Promise((done) => setTimeout(done, 50));
    // A second request, abandoned while the first is still drawing.
    await new Promise<void>((done) => {
      const { port } = server!.address() as AddressInfo;
      const request = httpRequest({
        host: "127.0.0.1",
        port,
        path: "/render",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      request.on("error", () => {});
      request.end(JSON.stringify(DARK_TILE), () =>
        setTimeout(() => request.destroy(), 50),
      );
      // Long enough for the server to see the connection close.
      request.on("close", () => setTimeout(done, 50));
    });

    renderer.hold = false;
    renderer.release();
    expect((await first).status).toBe(200);
    await new Promise((done) => setTimeout(done, 50));
    expect(renderer.drawn).toEqual([TILE]);
  });

  it("answers /style/{theme} with the theme's style, in a language if asked", async () => {
    const renderer = stubRenderer();
    const base = await serve(renderer);

    for (const path of ["/style/light", "/style/dark?language=de"]) {
      const response = await fetch(`${base}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(await response.json()).toEqual(STYLE);
    }
    expect(renderer.styled).toEqual([
      ["light", undefined],
      ["dark", "de"],
    ]);
  });

  it("answers 400 for a theme or a language a tile would be refused", async () => {
    const renderer = stubRenderer();
    const base = await serve(renderer);

    for (const path of [
      "/style/sepia",
      "/style/light?language=en",
      "/style/light?language=de-DE",
      "/style/light?language=",
    ]) {
      const response = await fetch(`${base}${path}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("detail");
    }
    expect(renderer.styled).toEqual([]);
  });

  it("answers 503 for a style while it cannot render", async () => {
    const renderer = stubRenderer();
    renderer.healthy = false;
    const base = await serve(renderer);
    expect((await fetch(`${base}/style/light`)).status).toBe(503);
    expect(renderer.styled).toEqual([]);
  });

  it("answers 503, and nothing partial, when the style cannot be had", async () => {
    const lines: string[] = [];
    const renderer = stubRenderer();
    renderer.styleFails = true;
    server = createRendererServer({
      renderer,
      signature: SIGNATURE,
      attribution: ATTRIBUTION,
      log: (line) => lines.push(line),
    });
    await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const response = await fetch(`${base}/style/light`);
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty("detail");
    expect(lines).toEqual([expect.stringContaining("the provider answered")]);
  });

  it("answers a style past a full queue, while a draw holds it", async () => {
    const renderer = stubRenderer();
    renderer.hold = true;
    const base = await serve(renderer, 1);

    const held = render(base, TILE);
    await expect.poll(() => renderer.checks).toBe(1);
    expect((await render(base, TILE)).status).toBe(503);

    expect((await fetch(`${base}/style/light`)).status).toBe(200);

    renderer.release();
    expect((await held).status).toBe(200);
  });

  it("gives a style no place in the queue", async () => {
    const renderer = stubRenderer();
    let finish = () => {};
    renderer.styleGate = new Promise((done) => (finish = done));
    const base = await serve(renderer, 1);

    const styled = fetch(`${base}/style/light`);
    await expect.poll(() => renderer.styled.length).toBe(1);
    expect((await render(base, TILE)).status).toBe(200);

    finish();
    expect((await styled).status).toBe(200);
  });

  it("answers 404 and 405 for what it does not serve", async () => {
    const base = await serve(stubRenderer());
    expect((await fetch(`${base}/`)).status).toBe(404);
    const get = await fetch(`${base}/render`);
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    const post = await fetch(`${base}/signature`, { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET");
    const style = await fetch(`${base}/style/light`, { method: "POST" });
    expect(style.status).toBe(405);
    expect(style.headers.get("allow")).toBe("GET");
    expect((await fetch(`${base}/style`)).status).toBe(404);
    expect((await fetch(`${base}/style/light/extra`)).status).toBe(404);
  });
});
