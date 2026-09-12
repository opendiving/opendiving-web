import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COVERED_KEYS,
  DEVICE_MEMORY_OPT_OUT_KEY,
  deviceMemoryClass,
  installDeviceMemorySuppression,
  isOptedOut,
  setOptOut,
  subscribeToOptOut,
} from "./device-memory";
import {
  DIVE_PROFILE_SERIES_KEY,
  GAS_USE_SERIES_KEY,
  readStoredSeries,
  writeSeriesVisibility,
} from "./chart-series-view";
import {
  readStoredEntryUnits,
  subscribeToEntryUnits,
  writeEntryUnits,
} from "./entry-units";
import { dismissPasskeyNudge, isPasskeyNudgeDismissed } from "./passkey-nudge";
import { writeGasUseView } from "./gas-use-view";
import { writeDiveActivityView } from "./dive-activity-view";
import { memoryStorage, useStorage } from "@/test/memory-storage";

// What jsdom cannot answer, stated once so no test here pretends otherwise: the
// interposition's interplay with next-themes needs a real document. jsdom runs
// neither the pre-hydration script nor cross-document `storage` events, so an
// assertion here about first-paint fallback or about tab B's rewrite being
// dropped would pass against an implementation that does nothing at all. What
// is pinned below is the part that is pure logic - which keys are dropped,
// when, and on which receiver - and `device-memory-switch.render.test.tsx`
// pins the one theme assertion that is real under jsdom.

beforeEach(() => {
  // The order matters and is the whole reason it is spelled out here rather
  // than tucked into a helper: the harness swaps in a fresh store after every
  // test, and a fresh store is an unwrapped one, so the storage has to exist
  // before the interposition is installed on it.
  useStorage(memoryStorage());
  installDeviceMemorySuppression();
});

describe("deviceMemoryClass", () => {
  it("classifies every key it knows and nothing else", () => {
    expect(deviceMemoryClass("theme")).toBe("covered");
    expect(deviceMemoryClass("opendiving:entry-units")).toBe("covered");
    expect(deviceMemoryClass("opendiving:post-auth-redirect")).toBe("excluded");
    expect(deviceMemoryClass(DEVICE_MEMORY_OPT_OUT_KEY)).toBe("excluded");
    expect(deviceMemoryClass("opendiving:invented-here")).toBeNull();
  });
});

describe("setOptOut", () => {
  it("clears by prefix, not by census", () => {
    const store = window.localStorage;
    store.setItem("theme", "dark");
    store.setItem("opendiving:entry-units", '{"depth":"imperial"}');
    store.setItem("opendiving:gas-use-view", '{"scope":"year","anchor":null}');
    // Three orphans left behind by key bumps and one by a deleted feature, none
    // of which has a literal anywhere in this tree - the case that forced
    // prefix clearing rather than a list.
    store.setItem("opendiving:dive-profile-series", "[]");
    store.setItem("opendiving:dive-profile-series-v2", "[]");
    store.setItem("opendiving:dive-profile-series-v3", "[]");
    store.setItem("opendiving:last-auth-method", "google");
    // And one nobody has invented yet, which is the point of the prefix rule.
    store.setItem("opendiving:never-existed", "x");
    // The exclusions, which have to survive.
    store.setItem("opendiving:post-auth-redirect", "/dives");
    store.setItem("opendiving:google-sign-in-attempts", "{}");

    setOptOut(true);

    expect(store.getItem(DEVICE_MEMORY_OPT_OUT_KEY)).not.toBeNull();
    expect(store.getItem("opendiving:post-auth-redirect")).toBe("/dives");
    expect(store.getItem("opendiving:google-sign-in-attempts")).toBe("{}");
    for (const gone of [
      "theme",
      "opendiving:entry-units",
      "opendiving:gas-use-view",
      "opendiving:dive-profile-series",
      "opendiving:dive-profile-series-v2",
      "opendiving:dive-profile-series-v3",
      "opendiving:last-auth-method",
      "opendiving:never-existed",
    ]) {
      expect(store.getItem(gone)).toBeNull();
    }
  });

  it("removes only the flag when switched back off, and restores nothing", () => {
    const store = window.localStorage;
    store.setItem("theme", "dark");
    setOptOut(true);

    setOptOut(false);

    expect(store.getItem(DEVICE_MEMORY_OPT_OUT_KEY)).toBeNull();
    expect(store.getItem("theme")).toBeNull();
    expect(isOptedOut()).toBe(false);
  });

  it("notifies subscribers, so both surfaces read one state", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToOptOut(listener);

    setOptOut(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isOptedOut()).toBe(true);

    unsubscribe();
    setOptOut(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("says nothing and throws nothing where the browser refuses storage", () => {
    useStorage(undefined);

    expect(() => setOptOut(true)).not.toThrow();
    expect(isOptedOut()).toBe(false);
  });
});

describe("the interposition", () => {
  it("drops a covered write only while the flag is actually present", () => {
    const store = window.localStorage;

    store.setItem("theme", "dark");
    expect(store.getItem("theme")).toBe("dark");

    setOptOut(true);
    store.setItem("theme", "dark");
    expect(store.getItem("theme")).toBeNull();

    setOptOut(false);
    store.setItem("theme", "dark");
    expect(store.getItem("theme")).toBe("dark");
  });

  // The two-tab case, reduced to the only half jsdom can see. Tab A's flag
  // reaches tab B through storage rather than through module state, so the
  // check has to read storage on every write - a boolean cached at install
  // time would let tab B's next-themes rewrite through.
  it("honours a flag it never wrote itself", () => {
    const store = window.localStorage;
    store.setItem(DEVICE_MEMORY_OPT_OUT_KEY, "1");

    store.setItem("theme", "dark");

    expect(store.getItem("theme")).toBeNull();
  });

  it("passes everything else through byte-identical", () => {
    const store = window.localStorage;
    setOptOut(true);

    store.setItem("opendiving:post-auth-redirect", "/dives/abc");
    store.setItem("something-else-entirely", "kept");
    expect(store.getItem("opendiving:post-auth-redirect")).toBe("/dives/abc");
    expect(store.getItem("something-else-entirely")).toBe("kept");

    store.removeItem("something-else-entirely");
    expect(store.getItem("something-else-entirely")).toBeNull();
    expect(store.getItem("nothing-was-ever-here")).toBeNull();
  });

  it("wraps the object that defines `setItem`, not the one handed to it", () => {
    const { local, session, prototype } = sharedPrototypeStorages();
    useStorage(local);
    installDeviceMemorySuppression();

    expect(Object.prototype.hasOwnProperty.call(local, "setItem")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(prototype, "setItem")).toBe(
      true,
    );

    setOptOut(true);
    local.setItem("theme", "dark");
    // The receiver guard: in a browser `sessionStorage` shares this prototype,
    // and nothing about the objection reaches it.
    session.setItem("theme", "dark");

    expect(local.getItem("theme")).toBeNull();
    expect(session.getItem("theme")).toBe("dark");
  });

  it("installs once, however many times it is called", () => {
    const owner = window.localStorage;
    const wrapped = owner.setItem;

    installDeviceMemorySuppression();
    installDeviceMemorySuppression();

    expect(owner.setItem).toBe(wrapped);
  });

  it("is a no-op where there is no storage to interpose on", () => {
    useStorage(undefined);

    expect(() => installDeviceMemorySuppression()).not.toThrow();
  });
});

describe("the covered writers under the switch", () => {
  beforeEach(() => {
    setOptOut(true);
  });

  it("keeps the entry-unit toggles live in-session while storing nothing", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToEntryUnits(listener);

    writeEntryUnits({ depth: "imperial" });

    // The module caches what was *asked for* rather than re-reading, which is
    // what makes a refused write indistinguishable from Safari private mode -
    // the boxes still flip, the choice simply is not remembered.
    expect(readStoredEntryUnits()).toBe('{"depth":"imperial"}');
    expect(listener).toHaveBeenCalled();
    expect(window.localStorage.getItem("opendiving:entry-units")).toBeNull();

    unsubscribe();
  });

  it("stores no chart selection", () => {
    writeSeriesVisibility(DIVE_PROFILE_SERIES_KEY, ["depth"]);
    writeSeriesVisibility(GAS_USE_SERIES_KEY, ["dives"]);

    expect(readStoredSeries(DIVE_PROFILE_SERIES_KEY)).toBeNull();
    expect(readStoredSeries(GAS_USE_SERIES_KEY)).toBeNull();
  });

  it("stores neither dashboard card's remembered view", () => {
    writeGasUseView({ scope: "year", anchor: null });
    writeDiveActivityView({ scope: "year", anchor: null });

    expect(window.localStorage.getItem("opendiving:gas-use-view")).toBeNull();
    expect(
      window.localStorage.getItem("opendiving:dive-activity-view"),
    ).toBeNull();
  });

  it("keeps offering the passkey nudge, because nothing records the dismissal", () => {
    dismissPasskeyNudge();

    expect(isPasskeyNudgeDismissed()).toBe(false);
    expect(
      window.localStorage.getItem("opendiving:passkey-nudge-dismissed"),
    ).toBeNull();
  });

  it("covers every key it says it covers", () => {
    for (const key of COVERED_KEYS) {
      window.localStorage.setItem(key, "value");
      expect(window.localStorage.getItem(key)).toBeNull();
    }
  });
});

// Two `Storage`s sharing one prototype, which is the shape a browser has and
// the shape `test/memory-storage.ts` deliberately does not: its stub's methods
// are own properties, so an interposition hard-coded to `Storage.prototype`
// would be invisible to every other test in this repo and the suppression suite
// would pass against an implementation that does nothing.
class SharedPrototypeStorage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

function sharedPrototypeStorages(): {
  local: Storage;
  session: Storage;
  prototype: object;
} {
  return {
    local: new SharedPrototypeStorage() as Storage,
    session: new SharedPrototypeStorage() as Storage,
    prototype: SharedPrototypeStorage.prototype,
  };
}
