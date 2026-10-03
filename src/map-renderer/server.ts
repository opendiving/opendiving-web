// The renderer's HTTP face: what the API, its only client, may ask of it.
//
//   GET  /healthz    200 while it can render, 503 otherwise
//   GET  /signature  200 {"signature": "<64 lowercase hex>"}
//   POST /render     200 image/webp, a 1024x1024 tile, with X-Map-Signature;
//                    400 for a body of the wrong shape; 503 when the queue is
//                    full, the render passes its deadline, or it cannot render
//
// Reachable only inside the stack and taking no credential: it is a private
// service on the flagship and an unexposed one in the bundle.

import { createServer, type IncomingMessage, type Server } from "node:http";

import { parsePayload, PayloadError, type TilePayload } from "./payload";

// The most draws the API's default deadline, `MAP_RENDERER_TIMEOUT`'s 90 s,
// covers at the slowest cold tile `scripts/measure-map-renderer.mjs` measured
// on the flagship's plan - counted with the one being drawn, so the last place
// in a full queue is answered inside the deadline by construction. A first
// view asking for more is answered 503 past it, which shows water.
export const QUEUE_LIMIT = 55;

// Many times a tile's body, which is five short keys.
const MAX_BODY_BYTES = 4 * 1024;

export interface Renderer {
  /** Whether a tile could be drawn now. */
  isHealthy(): boolean;
  /** One tile, or a thrown error. */
  draw(payload: TilePayload): Promise<Buffer>;
}

export interface RendererServerOptions {
  renderer: Renderer;
  signature: string;
  queueLimit?: number;
  log?: (message: string) => void;
}

class BodyError extends Error {}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BodyError("The body is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export function createRendererServer({
  renderer,
  signature,
  queueLimit = QUEUE_LIMIT,
  log = () => {},
}: RendererServerOptions): Server {
  // Draws are taken strictly in turn: MapLibre Native renders one tile at a
  // time per map, and on half a CPU a second at once would only make both late.
  let admitted = 0;
  let turn: Promise<unknown> = Promise.resolve();

  const signatureBody = JSON.stringify({ signature });

  return createServer(async (request, response) => {
    const send = (
      status: number,
      body: string | Buffer,
      type = "application/json",
      headers: Record<string, string> = {},
    ) => {
      if (response.headersSent || response.destroyed) return;
      response.writeHead(status, {
        "Content-Type": type,
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
        ...headers,
      });
      response.end(body);
    };
    const fail = (status: number, detail: string, headers = {}) =>
      send(status, JSON.stringify({ detail }), "application/json", headers);

    const { pathname } = new URL(request.url ?? "/", "http://renderer");
    const route = `${request.method} ${pathname}`;

    if (route === "GET /healthz") {
      return renderer.isHealthy()
        ? send(200, JSON.stringify({ status: "ok" }))
        : fail(503, "The renderer cannot draw yet");
    }
    if (route === "GET /signature") return send(200, signatureBody);
    if (pathname === "/healthz" || pathname === "/signature") {
      return fail(405, "Method not allowed", { Allow: "GET" });
    }
    if (pathname !== "/render") return fail(404, "Not found");
    if (request.method !== "POST") {
      return fail(405, "Method not allowed", { Allow: "POST" });
    }

    const type = request.headers["content-type"]?.split(";")[0].trim();
    if (type !== "application/json") {
      return fail(400, "The body must be application/json");
    }

    let payload: TilePayload;
    try {
      payload = parsePayload(JSON.parse(await readBody(request)));
    } catch (error) {
      if (error instanceof PayloadError || error instanceof BodyError) {
        return fail(400, error.message);
      }
      if (error instanceof SyntaxError)
        return fail(400, "The body is not JSON");
      log(`Could not read a body: ${(error as Error).message}`);
      return fail(400, "The body could not be read");
    }

    if (!renderer.isHealthy()) return fail(503, "The renderer cannot draw yet");
    if (admitted >= queueLimit) {
      return fail(503, "The renderer's queue is full", { "Retry-After": "5" });
    }

    // A client that has gone - the API gave up on its deadline - is owed
    // nothing, and drawing for it would only make everyone behind it later.
    let gone = false;
    response.on("close", () => {
      if (!response.writableFinished) gone = true;
    });

    admitted += 1;
    const queued = performance.now();
    const tile = `${payload.theme} ${payload.z}/${payload.x}/${payload.y}`;
    const drawn = turn.then(async () => {
      if (gone) return null;
      const started = performance.now();
      const image = await renderer.draw(payload);
      log(
        `drew a tile, ${tile}, in ` +
          `${Math.round(performance.now() - started)} ms, after ` +
          `${Math.round(started - queued)} ms in the queue`,
      );
      return image;
    });
    turn = drawn.catch(() => {});

    try {
      const image = await drawn;
      if (image) {
        send(200, image, "image/webp", { "X-Map-Signature": signature });
      }
    } catch (error) {
      log(`Could not draw the tile ${tile}: ${(error as Error).message}`);
      fail(503, "The tile could not be drawn");
    } finally {
      admitted -= 1;
    }
  });
}
