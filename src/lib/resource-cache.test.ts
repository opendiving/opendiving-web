import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import {
  clearResourceCache,
  evictResourceCache,
  readResourceCache,
  resourceCacheGeneration,
  resourceCacheSize,
  writeResourceCache,
} from "./resource-cache";

beforeEach(() => {
  clearResourceCache();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resource cache", () => {
  it("hands back what was stored", () => {
    writeResourceCache(
      "dives:u1:page:1:per:10",
      { data: [1, 2] },
      resourceCacheGeneration(),
    );

    expect(readResourceCache("dives:u1:page:1:per:10")).toEqual({
      data: [1, 2],
    });
  });

  it("misses on a key it has never seen", () => {
    expect(readResourceCache("nothing")).toBeUndefined();
  });

  it("drops an entry once it is older than the max age", () => {
    vi.useFakeTimers();
    writeResourceCache("dive:1", { uuid: "1" }, resourceCacheGeneration());

    // Just inside five minutes, then just outside it. A tab left open should
    // stand the page in again rather than show figures from before lunch.
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(readResourceCache("dive:1")).toEqual({ uuid: "1" });

    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(readResourceCache("dive:1")).toBeUndefined();
    // The expired entry is dropped, not merely hidden.
    expect(resourceCacheSize()).toBe(0);
  });

  it("evicts the least recently read entry once full", () => {
    for (let i = 0; i < 50; i++)
      writeResourceCache(`dive:${i}`, i, resourceCacheGeneration());
    expect(resourceCacheSize()).toBe(50);

    // Touching the oldest entry makes it the newest, so the *next* one along is
    // what the following write pushes out.
    expect(readResourceCache("dive:0")).toBe(0);
    writeResourceCache("dive:50", 50, resourceCacheGeneration());

    expect(resourceCacheSize()).toBe(50);
    expect(readResourceCache("dive:0")).toBe(0);
    expect(readResourceCache("dive:1")).toBeUndefined();
    expect(readResourceCache("dive:50")).toBe(50);
  });

  it("empties completely, since that is what every write falls back on", () => {
    writeResourceCache(
      "dives:u1:page:1:per:10",
      { data: [] },
      resourceCacheGeneration(),
    );
    writeResourceCache("dive:1", { uuid: "1" }, resourceCacheGeneration());

    clearResourceCache();

    expect(resourceCacheSize()).toBe(0);
    expect(readResourceCache("dive:1")).toBeUndefined();
  });
});

describe("resource cache generations", () => {
  it("drops a write whose request started before a clear", () => {
    // The shape this guards: a GET is in flight, a delete lands and empties the
    // cache, then the GET returns a body that still contains the deleted dive.
    const atGeneration = resourceCacheGeneration();
    clearResourceCache();

    writeResourceCache(
      "dives:u1:page:1:per:10",
      { data: ["deleted"] },
      atGeneration,
    );

    expect(resourceCacheSize()).toBe(0);
  });

  it("accepts a write whose request started after the clear", () => {
    clearResourceCache();
    const atGeneration = resourceCacheGeneration();

    writeResourceCache(
      "dives:u1:page:1:per:10",
      { data: ["fresh"] },
      atGeneration,
    );

    expect(readResourceCache("dives:u1:page:1:per:10")).toEqual({
      data: ["fresh"],
    });
  });

  it("drops one entry without disturbing the rest", () => {
    clearResourceCache();
    writeResourceCache("dive:1", { uuid: "1" }, resourceCacheGeneration());
    writeResourceCache("dive:2", { uuid: "2" }, resourceCacheGeneration());

    // What the 404 path uses: a record the API says is gone must not sit in the
    // map re-rendering and re-bouncing for the rest of its five minutes.
    evictResourceCache("dive:1");

    expect(readResourceCache("dive:1")).toBeUndefined();
    expect(readResourceCache("dive:2")).toEqual({ uuid: "2" });
  });
});
