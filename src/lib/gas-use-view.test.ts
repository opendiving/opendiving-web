import { beforeEach, describe, expect, it } from "vitest";
import {
  parseGasUseView,
  readStoredGasUseView,
  writeGasUseView,
} from "@/lib/gas-use-view";

// `resolveAnchor` moved to `lib/chart-period.ts` when the activity card wanted it
// too; its tests moved with it, to `chart-period.test.ts`.

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
