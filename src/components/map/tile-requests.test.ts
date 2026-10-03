import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The page's map tiles and the requests for them: at most four out at a time,
// the rest in the order their maps asked, one request per tile however many
// maps wait on it, a request let go when its last map withdraws, and a bounded
// cache that revokes what it drops - the least recently shown first.

type Module = typeof import("./tile-requests");

// A fresh module per test: the cache and the queue are the page's, and a test
// that left a request out would hold a slot in the next one.
let tiles: Module;
beforeEach(async () => {
  vi.resetModules();
  tiles = await import("./tile-requests");
});

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
let created = 0;
beforeEach(() => {
  created = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++created}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

// A request the test answers by hand, recording the signal it was handed.
function deferred() {
  const calls: {
    signal: AbortSignal;
    resolve: (blob: Blob) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const load = vi.fn(
    (signal: AbortSignal) =>
      new Promise<Blob>((resolve, reject) => {
        calls.push({ signal, resolve, reject });
      }),
  );
  return { load, calls };
}

const settled = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("tile requests", () => {
  it("keeps four requests out at a time, and starts the rest in the order asked", async () => {
    const { load, calls } = deferred();
    const keys = ["/t/a", "/t/b", "/t/c", "/t/d", "/t/e", "/t/f"];
    for (const key of keys) {
      tiles.requestTile(
        key,
        (signal) => load(signal),
        () => {},
      );
    }

    expect(tiles.MAX_TILE_REQUESTS).toBe(4);
    expect(load).toHaveBeenCalledTimes(tiles.MAX_TILE_REQUESTS);

    calls[1].resolve(new Blob(["b"]));
    await settled();
    expect(load).toHaveBeenCalledTimes(5);
    expect(tiles.findTile("/t/b")).toBe("blob:1");

    // A failure frees its slot too.
    calls[0].reject(new Error("503"));
    await settled();
    expect(load).toHaveBeenCalledTimes(6);
  });

  it("hands each map the tile, or null where it could not be had", async () => {
    const { load, calls } = deferred();
    const shown = vi.fn();
    const failed = vi.fn();
    tiles.requestTile("/t/a", load, shown);
    tiles.requestTile("/t/b", load, failed);

    calls[0].resolve(new Blob(["a"]));
    calls[1].reject(new Error("429"));
    await settled();

    expect(shown).toHaveBeenCalledExactlyOnceWith("blob:1");
    expect(failed).toHaveBeenCalledExactlyOnceWith(null);
    // A failure is not kept, so whoever asks next asks the API again.
    expect(tiles.findTile("/t/b")).toBeUndefined();
  });

  it("asks once for a tile two maps wait on", async () => {
    const { load, calls } = deferred();
    const first = vi.fn();
    const second = vi.fn();
    tiles.requestTile("/t/a", load, first);
    tiles.requestTile("/t/a", load, second);

    expect(load).toHaveBeenCalledOnce();
    calls[0].resolve(new Blob(["a"]));
    await settled();
    expect(first).toHaveBeenCalledWith("blob:1");
    expect(second).toHaveBeenCalledWith("blob:1");
  });

  it("aborts a request out when its last map withdraws, and frees the slot", async () => {
    const { load, calls } = deferred();
    const withdrawFirst = tiles.requestTile("/t/a", load, vi.fn());
    const withdrawSecond = tiles.requestTile("/t/a", load, vi.fn());
    for (const key of ["/t/b", "/t/c", "/t/d", "/t/e"]) {
      tiles.requestTile(key, load, vi.fn());
    }

    withdrawFirst();
    expect(calls[0].signal.aborted).toBe(false);
    withdrawSecond();
    expect(calls[0].signal.aborted).toBe(true);

    // The aborted request's rejection is what lets the next one start.
    calls[0].reject(new DOMException("aborted", "AbortError"));
    await settled();
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("drops a queued request its map withdraws from, never sending it", async () => {
    const { load, calls } = deferred();
    for (const key of ["/t/a", "/t/b", "/t/c", "/t/d"]) {
      tiles.requestTile(key, load, vi.fn());
    }
    const withdraw = tiles.requestTile("/t/e", load, vi.fn());
    tiles.requestTile("/t/f", load, vi.fn());

    withdraw();
    calls[0].resolve(new Blob(["a"]));
    await settled();

    expect(load).toHaveBeenCalledTimes(5);
    // The one started in its place is f's: nothing was sent for e.
    calls[4].resolve(new Blob(["f"]));
    await settled();
    expect(tiles.findTile("/t/f")).toBeDefined();
    expect(tiles.findTile("/t/e")).toBeUndefined();
  });

  it("keeps two hundred tiles, revoking the least recently shown past that", async () => {
    const load = () => Promise.resolve(new Blob(["x"]));
    for (let index = 0; index < 200; index += 1) {
      tiles.requestTile(`/t/${index}`, load, () => {});
      await settled();
    }
    // Shown again, so it is the last to go rather than the first.
    expect(tiles.findTile("/t/0")).toBe("blob:1");

    tiles.requestTile("/t/200", load, () => {});
    await settled();

    expect(tiles.findTile("/t/0")).toBe("blob:1");
    expect(tiles.findTile("/t/1")).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:2");
    expect(tiles.findTile("/t/200")).toBe("blob:201");
  });
});
