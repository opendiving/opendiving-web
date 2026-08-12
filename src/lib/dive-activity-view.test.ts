import { beforeEach, describe, expect, it } from "vitest";
import {
  parseDiveActivityView,
  readStoredDiveActivityView,
  resolveYear,
  writeDiveActivityView,
} from "@/lib/dive-activity-view";

// The pair the card actually composes: read the raw entry, then parse it.
function readDiveActivityView() {
  return parseDiveActivityView(readStoredDiveActivityView());
}

const KEY = "opendiving:dive-activity-view";

// Same stub, for the same reason, as `gas-use-view.test.ts`: under this runner
// jsdom doesn't provide `window.localStorage` at all - Node's own experimental
// global shadows it - so the tests install their own rather than depend on that
// quirk staying fixed either way.
function memoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, value),
  };
}

function useStorage(storage: Storage | undefined) {
  Object.defineProperty(window, "localStorage", {
    value: storage,
    configurable: true,
  });
}

describe("readStoredDiveActivityView / writeDiveActivityView", () => {
  beforeEach(() => {
    useStorage(memoryStorage());
  });

  it("round-trips a view", () => {
    writeDiveActivityView({ scope: "month", year: 2025 });

    expect(readDiveActivityView()).toEqual({ scope: "month", year: 2025 });
  });

  it("round-trips the never-picked-a-year case", () => {
    // Null is a real value here, not an absence: it means "follow the most
    // recent year", which keeps working as the diver dives into a new one.
    writeDiveActivityView({ scope: "year", year: null });

    expect(readDiveActivityView()).toEqual({ scope: "year", year: null });
  });

  it("does not collide with the gas card's remembered view", () => {
    // Two cards, two keys. A shared entry would make each card's write have to
    // preserve the other's fields.
    writeDiveActivityView({ scope: "month", year: 2025 });

    expect(window.localStorage.getItem("opendiving:gas-use-view")).toBeNull();
  });

  it("has nothing to restore on a first visit", () => {
    expect(readDiveActivityView()).toBeNull();
  });

  it("ignores a value that isn't JSON", () => {
    window.localStorage.setItem(KEY, "not json");

    expect(readDiveActivityView()).toBeNull();
  });

  it("ignores a scope the app doesn't have", () => {
    // The gas card's "all", for instance - a stale entry from someone who
    // assumed the two cards share a vocabulary. Restoring it would light no
    // button in the segmented control at all.
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ scope: "all", year: null }),
    );

    expect(readDiveActivityView()).toBeNull();
  });

  it("ignores a year that isn't a whole number", () => {
    // Anything here reaches a `<Select>` value and a `Date`; a non-integer
    // matches no option and renders an empty trigger.
    for (const year of ["2025", true, {}, [], 2025.5]) {
      window.localStorage.setItem(
        KEY,
        JSON.stringify({ scope: "month", year }),
      );
      expect(readDiveActivityView()).toBeNull();
    }
  });

  it("ignores a view with no year key at all", () => {
    // Distinct from a stored `null`, which this module writes and which means
    // "follow the most recent year". An absent key is a shape we never write.
    window.localStorage.setItem(KEY, JSON.stringify({ scope: "month" }));

    expect(readDiveActivityView()).toBeNull();
  });

  it("reads a stored NaN as no year picked", () => {
    // Not a gap in the validation above: `JSON.stringify` turns `NaN` into
    // `null`, so it cannot survive being written. Pinned so nobody "fixes" the
    // validator to reject something that can't arrive.
    writeDiveActivityView({ scope: "month", year: NaN });

    expect(readDiveActivityView()).toEqual({ scope: "month", year: null });
  });

  it("survives storage that refuses to answer", () => {
    // Storage disabled by policy, or a quota-exceeded write.
    const denied = memoryStorage();
    denied.getItem = () => {
      throw new Error("denied");
    };
    denied.setItem = () => {
      throw new Error("denied");
    };
    useStorage(denied);

    expect(() =>
      writeDiveActivityView({ scope: "month", year: 2025 }),
    ).not.toThrow();
    expect(readDiveActivityView()).toBeNull();
  });

  it("survives storage not being there at all", () => {
    // Reaching through a missing `window.localStorage` is a `TypeError`, not a
    // storage error - and it is exactly the state this runner starts in.
    useStorage(undefined);

    expect(() =>
      writeDiveActivityView({ scope: "month", year: 2025 }),
    ).not.toThrow();
    expect(readDiveActivityView()).toBeNull();
  });
});

describe("resolveYear", () => {
  const years = [2023, 2025];

  it("keeps a year that still has diving in it", () => {
    expect(resolveYear(2023, years)).toBe(2023);
  });

  it("falls back to the most recent when nothing was remembered", () => {
    expect(resolveYear(null, years)).toBeNull();
  });

  it("falls back to the most recent when the year has emptied out", () => {
    // Its dives were deleted, or their dates corrected into another year. The
    // dropdown no longer offers it, and a `<Select>` whose value matches no
    // item renders an empty trigger.
    expect(resolveYear(2025, [2023])).toBeNull();
  });

  it("falls back to the most recent when the logbook is empty", () => {
    expect(resolveYear(2025, [])).toBeNull();
  });
});
