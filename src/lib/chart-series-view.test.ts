import { beforeEach, describe, expect, it } from "vitest";
import {
  parseSeriesVisibility,
  readStoredSeries,
  toggleSeries,
  writeSeriesVisibility,
} from "@/lib/chart-series-view";

const KEY = "opendiving:test-series";

// The three the profile chart has, standing in for any chart's list.
const ALLOWED = ["depth", "temperature", "pressure"] as const;

// The pair the charts actually compose: read the raw entry, then parse it.
function readSeries() {
  return parseSeriesVisibility(readStoredSeries(KEY), ALLOWED);
}

// `window.localStorage` is installed per test rather than used as jsdom provides
// it, for the reason spelled out in `gas-use-view.test.ts`: under this runner
// Node's own experimental `localStorage` global shadows jsdom's, so
// `window.localStorage` is `undefined` here.
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

describe("readStoredSeries / writeSeriesVisibility", () => {
  beforeEach(() => {
    useStorage(memoryStorage());
  });

  it("round-trips a selection", () => {
    writeSeriesVisibility(KEY, ["depth", "pressure"]);

    expect(readSeries()).toEqual(["depth", "pressure"]);
  });

  it("round-trips a selection of nothing", () => {
    // Distinct from having no entry at all, which means "plot everything".
    // Hiding every series is a choice, and the charts honor it.
    writeSeriesVisibility(KEY, []);

    expect(readSeries()).toEqual([]);
  });

  it("has nothing to restore on a first visit", () => {
    expect(readSeries()).toBeNull();
  });

  it("keeps entries separate by key", () => {
    writeSeriesVisibility("opendiving:other-series", ["depth"]);

    expect(readSeries()).toBeNull();
  });

  it("ignores a value that isn't JSON", () => {
    window.localStorage.setItem(KEY, "not json");

    expect(readSeries()).toBeNull();
  });

  it("ignores a value that isn't an array", () => {
    for (const stored of ["null", '"depth"', "{}", "3"]) {
      window.localStorage.setItem(KEY, stored);
      expect(readSeries()).toBeNull();
    }
  });

  it("drops a series this build no longer plots", () => {
    // A stale entry from a version that had a fourth channel. The rest of the
    // selection is perfectly good and worth restoring.
    window.localStorage.setItem(KEY, JSON.stringify(["depth", "ppo2"]));

    expect(readSeries()).toEqual(["depth"]);
  });

  it("gives up on an entry naming nothing it recognizes", () => {
    // Not the same as an empty entry: this one asked for something, and none of
    // it exists. Restoring it as "hide everything" would open on a blank plot
    // for no reason the diver could account for, so it falls back to all.
    window.localStorage.setItem(KEY, JSON.stringify(["ppo2", "ceiling"]));

    expect(readSeries()).toBeNull();
  });

  it("returns the chart's order, not the stored one", () => {
    // The order is what the chart draws and lists in; a hand-edited or
    // reordered entry must not reorder the legend.
    window.localStorage.setItem(KEY, JSON.stringify(["pressure", "depth"]));

    expect(readSeries()).toEqual(["depth", "pressure"]);
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

    expect(() => writeSeriesVisibility(KEY, ["depth"])).not.toThrow();
    expect(readSeries()).toBeNull();
  });

  it("survives storage not being there at all", () => {
    // Not hypothetical: it is exactly the state this test file's own runner is
    // in before `useStorage` runs, and reaching through a missing
    // `window.localStorage` is a `TypeError`, not a storage error.
    useStorage(undefined);

    expect(() => writeSeriesVisibility(KEY, ["depth"])).not.toThrow();
    expect(readSeries()).toBeNull();
  });
});

describe("toggleSeries", () => {
  it("turns a hidden series on", () => {
    expect(toggleSeries(["depth"], "pressure", ALLOWED)).toEqual([
      "depth",
      "pressure",
    ]);
  });

  it("turns a visible series off", () => {
    expect(toggleSeries(["depth", "pressure"], "depth", ALLOWED)).toEqual([
      "pressure",
    ]);
  });

  it("will turn the last one off", () => {
    // Deliberate: an empty plot with the legend still under it is recoverable
    // in one click, and a toggle that silently refuses is worse than one that
    // does what it says.
    expect(toggleSeries(["depth"], "depth", ALLOWED)).toEqual([]);
  });

  it("returns the chart's order however the toggles were clicked", () => {
    const clicked = toggleSeries(
      toggleSeries([], "pressure", ALLOWED),
      "depth",
      ALLOWED,
    );

    expect(clicked).toEqual(["depth", "pressure"]);
  });

  it("orders by the list it's given, which is what the chart offers", () => {
    // The profile chart passes only the channels *this dive* recorded, so a
    // selection can never name one that isn't on screen.
    const available = ["temperature", "pressure"] as const;

    expect(toggleSeries(["pressure"], "temperature", available)).toEqual([
      "temperature",
      "pressure",
    ]);
  });
});
