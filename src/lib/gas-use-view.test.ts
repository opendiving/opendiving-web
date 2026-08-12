import { beforeEach, describe, expect, it } from "vitest";
import {
  parseGasUseView,
  readStoredGasUseView,
  resolveAnchor,
  writeGasUseView,
} from "@/lib/gas-use-view";

// The pair the component actually composes: read the raw entry, then parse it.
function readGasUseView() {
  return parseGasUseView(readStoredGasUseView());
}

const KEY = "opendiving:gas-use-view";

// `window.localStorage` is installed per test rather than used as jsdom provides
// it, because under this runner jsdom doesn't provide it at all: Node's own
// experimental `localStorage` global (gated behind `--localstorage-file`)
// shadows it, so `window.localStorage` is `undefined` here while
// `sessionStorage` is fine - which is why `auth-redirect.test.ts` needs none of
// this. A stub also makes these tests independent of that quirk being fixed.
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

describe("readStoredGasUseView / writeGasUseView", () => {
  beforeEach(() => {
    useStorage(memoryStorage());
  });

  it("round-trips a view", () => {
    writeGasUseView({ scope: "month", anchor: 1743600000000 });

    expect(readGasUseView()).toEqual({
      scope: "month",
      anchor: 1743600000000,
    });
  });

  it("round-trips the never-picked-a-period case", () => {
    // Null is a real value here, not an absence: it means "follow the most
    // recent dive", which is different from having picked the period that
    // happens to be most recent today.
    writeGasUseView({ scope: "year", anchor: null });

    expect(readGasUseView()).toEqual({ scope: "year", anchor: null });
  });

  it("has nothing to restore on a first visit", () => {
    expect(readGasUseView()).toBeNull();
  });

  it("ignores a value that isn't JSON", () => {
    window.localStorage.setItem(KEY, "not json");

    expect(readGasUseView()).toBeNull();
  });

  it("ignores a scope the app doesn't have", () => {
    // A stale build, or someone editing storage by hand. Restoring it would
    // light no scope button at all.
    window.localStorage.setItem(KEY, JSON.stringify({ scope: "decade" }));

    expect(readGasUseView()).toBeNull();
  });

  it("ignores an anchor that isn't a number", () => {
    // A non-number reaching the chart would propagate into every plotted
    // coordinate and blank it, which is a much worse outcome than opening on
    // the default.
    for (const anchor of ["2026", true, {}, []]) {
      window.localStorage.setItem(
        KEY,
        JSON.stringify({ scope: "year", anchor }),
      );
      expect(readGasUseView()).toBeNull();
    }
  });

  it("ignores a view with no anchor key at all", () => {
    // Distinct from a stored `null`, which is a value this module writes and
    // means "follow the most recent dive". An absent key is a shape we never
    // write, so it's a stale or hand-edited entry.
    window.localStorage.setItem(KEY, JSON.stringify({ scope: "year" }));

    expect(readGasUseView()).toBeNull();
  });

  it("reads a stored NaN as no period picked", () => {
    // Not a gap in the validation above: `JSON.stringify` turns `NaN` into
    // `null`, so a `NaN` anchor cannot survive being written in the first
    // place, and what comes back is the legitimate null. Pinned so nobody
    // "fixes" the validator to reject it.
    writeGasUseView({ scope: "year", anchor: NaN });

    expect(readGasUseView()).toEqual({ scope: "year", anchor: null });
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

    expect(() => writeGasUseView({ scope: "year", anchor: 1 })).not.toThrow();
    expect(readGasUseView()).toBeNull();
  });

  it("survives storage not being there at all", () => {
    // Not hypothetical: it is exactly the state this test file's own runner is
    // in before `useStorage` runs, and reaching through a missing
    // `window.localStorage` is a `TypeError`, not a storage error.
    useStorage(undefined);

    expect(() => writeGasUseView({ scope: "year", anchor: 1 })).not.toThrow();
    expect(readGasUseView()).toBeNull();
  });
});

describe("resolveAnchor", () => {
  // Two dives in April 2025, one in October, one in March 2026.
  const times = [
    Date.UTC(2025, 3, 10),
    Date.UTC(2025, 3, 12),
    Date.UTC(2025, 9, 5),
    Date.UTC(2026, 2, 1),
  ];

  it("keeps an anchor whose dive is still there", () => {
    expect(resolveAnchor(times[2], "month", times)).toBe(times[2]);
  });

  it("falls back to the most recent when nothing was remembered", () => {
    expect(resolveAnchor(null, "year", times)).toBeNull();
  });

  it("falls back to the most recent when there are no dives at all", () => {
    expect(resolveAnchor(times[0], "year", [])).toBeNull();
  });

  it("lands on the same period when the remembered dive is gone", () => {
    // The April 10th dive was deleted, or its time was edited. The diver was
    // reading April 2025 and should still be reading April 2025.
    const withoutFirst = times.slice(1);

    expect(resolveAnchor(times[0], "month", withoutFirst)).toBe(times[1]);
  });

  it("gives up when the whole period is gone", () => {
    // Every April dive removed - there is no April 2025 to restore, and the
    // period select would render an empty trigger if we tried.
    const withoutApril = times.slice(2);

    expect(resolveAnchor(times[0], "month", withoutApril)).toBeNull();
  });

  it("resolves against the period the scope means", () => {
    // The same missing dive: April is gone as a *month*, but 2025 still has
    // October in it, so the year scope has somewhere to land.
    const withoutApril = times.slice(2);

    expect(resolveAnchor(times[0], "month", withoutApril)).toBeNull();
    expect(resolveAnchor(times[0], "year", withoutApril)).toBe(times[2]);
  });

  it("has no period to fall back to in the all scope", () => {
    // "All" plots everything regardless, so a stale anchor there only affects
    // where switching back to Year or Month lands - the default is right.
    expect(resolveAnchor(Date.UTC(2020, 0, 1), "all", times)).toBeNull();
  });
});
