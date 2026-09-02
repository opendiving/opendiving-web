import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENTRY_UNITS_KEY,
  clearEntryUnits,
  parseEntryUnits,
  readStoredEntryUnits,
  subscribeToEntryUnits,
  toggleDimension,
  writeEntryUnits,
} from "@/lib/entry-units";
import { memoryStorage, useStorage } from "@/test/memory-storage";

// `window.localStorage` is installed per test rather than used as jsdom provides
// it - see `test/memory-storage.ts` for why. Without it every read here would go
// through the module's try/catch and come back as "no override", and this whole
// file would pass with the feature deleted.

// The pair every consumer composes: read the raw entry, then parse it.
function readOverrides() {
  return parseEntryUnits(readStoredEntryUnits());
}

function stored(): string | null {
  return window.localStorage.getItem(ENTRY_UNITS_KEY);
}

describe("readStoredEntryUnits / writeEntryUnits", () => {
  beforeEach(() => {
    useStorage(memoryStorage());
  });

  it("has no overrides before anything is stored", () => {
    expect(readOverrides()).toEqual({});
    expect(readStoredEntryUnits()).toBeNull();
  });

  it("round-trips one dimension", () => {
    writeEntryUnits({ pressure: "imperial" });

    expect(readOverrides()).toEqual({ pressure: "imperial" });
  });

  it("round-trips several dimensions independently", () => {
    writeEntryUnits({ pressure: "imperial", depth: "metric" });

    expect(readOverrides()).toEqual({ pressure: "imperial", depth: "metric" });
  });

  // No overrides is the natural state, so it is spelled as no entry rather than
  // as a stored `{}` that would mean the same thing.
  it("removes the key rather than storing an empty record", () => {
    writeEntryUnits({ pressure: "imperial" });
    expect(stored()).not.toBeNull();

    writeEntryUnits({});

    expect(stored()).toBeNull();
    expect(readOverrides()).toEqual({});
  });

  // `getSnapshot` runs on every render of every consumer, and two of those sit on
  // the dive form's hottest path - `MixtureSetWarning` re-renders per keystroke.
  it("serves repeat reads from the cache instead of hitting storage", () => {
    const storage = memoryStorage();
    const getItem = vi.spyOn(storage, "getItem");
    useStorage(storage);

    readStoredEntryUnits();
    readStoredEntryUnits();
    readStoredEntryUnits();

    expect(getItem).toHaveBeenCalledTimes(1);
  });

  // The property that lets the cache survive per-file module state without a
  // test-only reset export: a fresh store is a different object, so it re-primes.
  it("re-primes when the storage object itself changes", () => {
    writeEntryUnits({ weight: "imperial" });
    expect(readOverrides()).toEqual({ weight: "imperial" });

    useStorage(memoryStorage());

    expect(readOverrides()).toEqual({});
  });

  // A store that already holds an entry, standing in for the next page load
  // reading back what a previous visit left behind.
  it("reads an entry this session never wrote", () => {
    const storage = memoryStorage();
    storage.setItem(ENTRY_UNITS_KEY, JSON.stringify({ depth: "imperial" }));
    useStorage(storage);

    expect(readOverrides()).toEqual({ depth: "imperial" });
  });
});

describe("parseEntryUnits", () => {
  // Filtered rather than rejected, like `parseSeriesVisibility`: one unusable
  // entry does not throw away a perfectly good record around it.
  it("drops a dimension this build has never heard of", () => {
    expect(
      parseEntryUnits(
        JSON.stringify({ pressure: "imperial", buoyancy: "imperial" }),
      ),
    ).toEqual({ pressure: "imperial" });
  });

  it("drops a dimension whose value is not a unit system", () => {
    expect(
      parseEntryUnits(JSON.stringify({ pressure: "psi", depth: "imperial" })),
    ).toEqual({ depth: "imperial" });
  });

  it("drops a dimension holding something that is not a string at all", () => {
    expect(
      parseEntryUnits(JSON.stringify({ pressure: 3000, depth: "imperial" })),
    ).toEqual({ depth: "imperial" });
  });

  it("reads a non-object entry as no overrides", () => {
    expect(parseEntryUnits(JSON.stringify("imperial"))).toEqual({});
    expect(parseEntryUnits(JSON.stringify(7))).toEqual({});
    expect(parseEntryUnits(JSON.stringify(null))).toEqual({});
    expect(parseEntryUnits(JSON.stringify(["depth"]))).toEqual({});
  });

  it("reads a malformed entry as no overrides", () => {
    expect(parseEntryUnits("{not json")).toEqual({});
  });

  it("reads an absent or empty entry as no overrides", () => {
    expect(parseEntryUnits(null)).toEqual({});
    expect(parseEntryUnits("")).toEqual({});
  });
});

describe("clearEntryUnits", () => {
  beforeEach(() => {
    useStorage(memoryStorage());
  });

  it("forgets every override", () => {
    writeEntryUnits({ pressure: "imperial", weight: "imperial" });

    clearEntryUnits();

    expect(stored()).toBeNull();
    expect(readOverrides()).toEqual({});
  });

  it("is harmless when there was nothing stored", () => {
    clearEntryUnits();

    expect(readOverrides()).toEqual({});
  });
});

describe("subscribeToEntryUnits", () => {
  beforeEach(() => {
    useStorage(memoryStorage());
  });

  it("tells every listener about a write", () => {
    const first = vi.fn();
    const second = vi.fn();
    subscribeToEntryUnits(first);
    subscribeToEntryUnits(second);

    writeEntryUnits({ depth: "imperial" });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("tells every listener about a clear", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToEntryUnits(listener);

    clearEntryUnits();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("stops telling a listener that has unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToEntryUnits(listener);

    unsubscribe();
    writeEntryUnits({ depth: "imperial" });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("toggleDimension", () => {
  // The absolute system is what gets recorded - "my SPG reads psi" - not
  // "flipped", so re-theming the account later does not invert the override.
  it("stores the other system for a metric account", () => {
    expect(toggleDimension({}, "pressure", "metric")).toEqual({
      pressure: "imperial",
    });
  });

  it("stores the other system for an imperial account", () => {
    expect(toggleDimension({}, "pressure", "imperial")).toEqual({
      pressure: "metric",
    });
  });

  // No-override is the natural state, so flipping back removes the key rather
  // than storing a value equal to the account's - which is what lets a later
  // account-level change carry every unoverridden dimension with it.
  it("removes the key when flipped back to the account system", () => {
    const flipped = toggleDimension({}, "pressure", "metric");

    expect(toggleDimension(flipped, "pressure", "metric")).toEqual({});
  });

  it("leaves the other dimensions alone", () => {
    const overrides = toggleDimension(
      { depth: "imperial", weight: "imperial" },
      "pressure",
      "metric",
    );

    expect(overrides).toEqual({
      depth: "imperial",
      weight: "imperial",
      pressure: "imperial",
    });
  });

  it("does not mutate the record it was given", () => {
    const before = { depth: "imperial" as const };

    toggleDimension(before, "pressure", "metric");

    expect(before).toEqual({ depth: "imperial" });
  });

  // The state a diver reaches by flipping pressure to psi and then switching the
  // account itself to imperial: the entry still says "imperial", which is now
  // simply redundant. Toggling from there has to move it, not read as already-off.
  it("moves a redundant override off the account system", () => {
    expect(
      toggleDimension({ pressure: "imperial" }, "pressure", "imperial"),
    ).toEqual({ pressure: "metric" });
  });
});

describe("when the browser hands out no usable storage", () => {
  // Safari private mode, storage disabled, quota - and under this runner, the
  // ordinary state before `useStorage` is called. Entering in account units is a
  // fine outcome, not an error case.
  // Each of these primes a real store first, so the assertion is that the broken
  // storage was actually consulted rather than that the cache happened to be
  // empty already.
  beforeEach(() => {
    useStorage(memoryStorage());
    writeEntryUnits({ pressure: "imperial" });
  });

  it("reads as no overrides when storage is absent", () => {
    useStorage(undefined);

    expect(readOverrides()).toEqual({});
  });

  it("reads as no overrides when reaching for storage throws", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage is blocked");
      },
    });

    expect(readOverrides()).toEqual({});
  });

  it("reads as no overrides when the read itself throws", () => {
    const storage = memoryStorage();
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });
    useStorage(storage);

    expect(readOverrides()).toEqual({});
  });

  // The toggle still flips for this session, deliberately: the choice is not
  // remembered, which is honest, but a refused write must not leave a dead
  // control on the form.
  it("still flips the boxes when the write is refused", () => {
    const storage = memoryStorage();
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    useStorage(storage);

    writeEntryUnits({ pressure: "imperial" });

    expect(readOverrides()).toEqual({ pressure: "imperial" });
  });

  it("survives a refused remove", () => {
    const storage = memoryStorage();
    vi.spyOn(storage, "removeItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });
    useStorage(storage);

    expect(() => clearEntryUnits()).not.toThrow();
    expect(readOverrides()).toEqual({});
  });

  it("survives a refused remove on an emptied record", () => {
    const storage = memoryStorage();
    vi.spyOn(storage, "removeItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });
    useStorage(storage);

    expect(() => writeEntryUnits({})).not.toThrow();
    expect(readOverrides()).toEqual({});
  });
});
