import type { AddressInfo } from "node:net";
import { request as httpRequest, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import type { RenderPayload } from "./payload";
import { createRendererServer, QUEUE_LIMIT, type Renderer } from "./server";

// The server driven over real HTTP with the contract's own bodies, and a
// stand-in for the drawing so the queue can be held full on purpose.

const SIGNATURE = "a".repeat(64);
const PICTURE = Buffer.from("RIFF....WEBPVP8 ");

const DIVE = {
  kind: "dive",
  theme: "light",
  dive_sites: [{ latitude: 28.5721, longitude: 34.5372 }],
  entry_latitude: null,
  entry_longitude: null,
  exit_latitude: null,
  exit_longitude: null,
};
const TRIP = {
  kind: "trip",
  theme: "dark",
  parts: [
    {
      location: {
        latitude: -18.14,
        longitude: 178.44,
        bbox_south: null,
        bbox_north: null,
        bbox_west: null,
        bbox_east: null,
      },
    },
    { location: null },
  ],
};

interface Stub extends Renderer {
  healthy: boolean;
  /** How many times the server asked, which it does as it admits a draw. */
  checks: number;
  drawn: RenderPayload[];
  /** Holds every draw until `release` is called, when set. */
  hold: boolean;
  release(): void;
  fail: boolean;
}

function stubRenderer(): Stub {
  let waiting: (() => void)[] = [];
  const stub: Stub = {
    healthy: true,
    checks: 0,
    drawn: [],
    hold: false,
    fail: false,
    isHealthy: () => {
      stub.checks += 1;
      return stub.healthy;
    },
    async draw(payload) {
      if (stub.hold) await new Promise<void>((done) => waiting.push(done));
      stub.drawn.push(payload);
      if (stub.fail) throw new Error("the provider answered 500");
      return PICTURE;
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
  server = createRendererServer({ renderer, signature: SIGNATURE, queueLimit });
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

  it("answers /signature with the signature it draws with", async () => {
    const base = await serve(stubRenderer());
    const response = await fetch(`${base}/signature`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ signature: SIGNATURE });
  });

  it("draws a dive and a trip, naming the signature it drew with", async () => {
    const renderer = stubRenderer();
    const base = await serve(renderer);

    for (const body of [DIVE, TRIP]) {
      const response = await render(base, body);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/webp");
      expect(response.headers.get("x-map-signature")).toBe(SIGNATURE);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(PICTURE);
    }
    expect(renderer.drawn).toEqual([DIVE, TRIP]);
  });

  it("takes a JSON content type with a charset", async () => {
    const base = await serve(stubRenderer());
    const response = await render(
      base,
      DIVE,
      "application/json; charset=utf-8",
    );
    expect(response.status).toBe(200);
  });

  it("answers 400 for a body that breaks the shape, and draws nothing", async () => {
    const renderer = stubRenderer();
    const base = await serve(renderer);

    for (const [body, type] of [
      [{ ...DIVE, name: "Blue Hole" }, "application/json"],
      [{ ...TRIP, kind: "site" }, "application/json"],
      ["{not json", "application/json"],
      [JSON.stringify(DIVE), "text/plain"],
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
    expect((await render(base, DIVE)).status).toBe(503);
    expect(renderer.drawn).toEqual([]);
  });

  it("answers 503, and no partial image, when a draw fails", async () => {
    const renderer = stubRenderer();
    renderer.fail = true;
    const base = await serve(renderer);
    const response = await render(base, DIVE);
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("answers 503 once its queue is full, and draws the rest in turn", async () => {
    const renderer = stubRenderer();
    renderer.hold = true;
    const base = await serve(renderer);

    const queued = Array.from({ length: QUEUE_LIMIT }, (_, index) =>
      render(base, {
        ...DIVE,
        dive_sites: [{ latitude: index, longitude: index }],
      }),
    );
    // Every one of them admitted before the next arrives: the server asks
    // whether it is healthy as it admits each, in the same tick.
    await expect.poll(() => renderer.checks).toBe(QUEUE_LIMIT);

    const turnedAway = await render(base, DIVE);
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
    expect(
      renderer.drawn.map((payload) =>
        payload.kind === "dive" ? payload.dive_sites[0].latitude : null,
      ),
    ).toEqual(Array.from({ length: QUEUE_LIMIT }, (_, index) => index));

    // And room again once they are done.
    renderer.hold = false;
    expect((await render(base, DIVE)).status).toBe(200);
  });

  it("skips a queued draw whose client has gone", async () => {
    const renderer = stubRenderer();
    renderer.hold = true;
    const base = await serve(renderer);

    const first = render(base, DIVE);
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
      request.end(JSON.stringify(TRIP), () =>
        setTimeout(() => request.destroy(), 50),
      );
      // Long enough for the server to see the connection close.
      request.on("close", () => setTimeout(done, 50));
    });

    renderer.hold = false;
    renderer.release();
    expect((await first).status).toBe(200);
    await new Promise((done) => setTimeout(done, 50));
    expect(renderer.drawn).toEqual([DIVE]);
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
  });
});
