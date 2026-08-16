import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import {
  clearResourceCache,
  readResourceCache,
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
    writeResourceCache("dives:u1:page:1:per:10", { data: [1, 2] });

    expect(readResourceCache("dives:u1:page:1:per:10")).toEqual({
      data: [1, 2],
    });
  });

  it("misses on a key it has never seen", () => {
    expect(readResourceCache("nothing")).toBeUndefined();
  });

  it("drops an entry once it is older than the max age", () => {
    vi.useFakeTimers();
    writeResourceCache("dive:1", { uuid: "1" });

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
    for (let i = 0; i < 50; i++) writeResourceCache(`dive:${i}`, i);
    expect(resourceCacheSize()).toBe(50);

    // Touching the oldest entry makes it the newest, so the *next* one along is
    // what the following write pushes out.
    expect(readResourceCache("dive:0")).toBe(0);
    writeResourceCache("dive:50", 50);

    expect(resourceCacheSize()).toBe(50);
    expect(readResourceCache("dive:0")).toBe(0);
    expect(readResourceCache("dive:1")).toBeUndefined();
    expect(readResourceCache("dive:50")).toBe(50);
  });

  it("empties completely, since that is what every write falls back on", () => {
    writeResourceCache("dives:u1:page:1:per:10", { data: [] });
    writeResourceCache("dive:1", { uuid: "1" });

    clearResourceCache();

    expect(resourceCacheSize()).toBe(0);
    expect(readResourceCache("dive:1")).toBeUndefined();
  });
});
