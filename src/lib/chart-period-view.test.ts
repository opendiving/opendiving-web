import { beforeEach, describe, expect, it } from "vitest";
import {
  DIVE_ACTIVITY_VIEW_KEY,
  GAS_USE_VIEW_KEY,
  parsePeriodView,
  readStoredPeriodView,
  writePeriodView,
} from "@/lib/chart-period-view";
import { memoryStorage, useStorage } from "@/test/memory-storage";

// `resolveAnchor`, which checks a restored anchor against the data that exists
// now, is in `lib/chart-period.ts` and tested there.

// The start of a day the diver had dives on - what the activity card stores. The
// gas card stores a dive's own timestamp; to this module both are a number.
const APRIL_8 = Date.UTC(2025, 3, 8);

// `window.localStorage` is installed per test rather than used as jsdom provides
// it - see `test/memory-storage.ts` for why it has to be, and why the stub isn't
// installed globally.
describe.each([
  { card: "activity", key: DIVE_ACTIVITY_VIEW_KEY },
  { card: "gas", key: GAS_USE_VIEW_KEY },
])("the $card card's remembered view", ({ key }) => {
  // The pair the hook actually composes: read the raw entry, then parse it.
  const read = () => parsePeriodView(readStoredPeriodView(key));
  const write = (view: Parameters<typeof writePeriodView>[1]) =>
    writePeriodView(key, view);

  beforeEach(() => {
    useStorage(memoryStorage());
  });

  it("round-trips a view", () => {
    write({ scope: "month", anchor: APRIL_8 });

    expect(read()).toEqual({ scope: "month", anchor: APRIL_8 });
  });

  it("round-trips the never-picked-a-period case", () => {
    // Null is a real value here, not an absence: it means "follow the most
    // recent dive", which is different from having picked the period that
    // happens to be most recent today.
    write({ scope: "year", anchor: null });

    expect(read()).toEqual({ scope: "year", anchor: null });
  });

  it("has nothing to restore on a first visit", () => {
    expect(read()).toBeNull();
  });

  it("ignores a value that isn't JSON", () => {
    window.localStorage.setItem(key, "not json");

    expect(read()).toBeNull();
  });

  it("ignores a scope the app doesn't have", () => {
    // A stale build, or someone editing storage by hand. Restoring it would
    // light no scope button at all.
    window.localStorage.setItem(
      key,
      JSON.stringify({ scope: "season", anchor: null }),
    );

    expect(read()).toBeNull();
  });

  it("ignores an anchor that isn't a finite number", () => {
    // A non-number reaching the chart would match no period option and
    // propagate into every plotted coordinate.
    for (const anchor of ["2025", true, {}, []]) {
      window.localStorage.setItem(
        key,
        JSON.stringify({ scope: "month", anchor }),
      );
      expect(read()).toBeNull();
    }
  });

  it("ignores a view with no anchor key at all", () => {
    // Distinct from a stored `null`, which this module writes and which means
    // "follow the most recent dive". An absent key is a shape we never write -
    // and it is also the shape of the `{ scope, year }` entries an older
    // activity card left behind, which are rejected whole rather than migrated.
    window.localStorage.setItem(key, JSON.stringify({ scope: "month" }));
    expect(read()).toBeNull();

    window.localStorage.setItem(
      key,
      JSON.stringify({ scope: "year", year: 2025 }),
    );
    expect(read()).toBeNull();
  });

  it("reads a stored NaN as no period picked", () => {
    // Not a gap in the validation above: `JSON.stringify` turns `NaN` into
    // `null`, so it cannot survive being written. Pinned so nobody "fixes" the
    // validator to reject something that can't arrive.
    write({ scope: "month", anchor: NaN });

    expect(read()).toEqual({ scope: "month", anchor: null });
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

    expect(() => write({ scope: "month", anchor: APRIL_8 })).not.toThrow();
    expect(read()).toBeNull();
  });

  it("survives storage not being there at all", () => {
    // Reaching through a missing `window.localStorage` is a `TypeError`, not a
    // storage error - and it is exactly the state this runner starts in.
    useStorage(undefined);

    expect(() => write({ scope: "month", anchor: APRIL_8 })).not.toThrow();
    expect(read()).toBeNull();
  });
});

describe("the two cards' remembered views", () => {
  beforeEach(() => {
    useStorage(memoryStorage());
  });

  it("do not collide", () => {
    // Two cards, two keys. They store the same *shape*, which is exactly why
    // they must not share an entry: each card's write would otherwise have to
    // preserve the other's period.
    writePeriodView(DIVE_ACTIVITY_VIEW_KEY, {
      scope: "month",
      anchor: APRIL_8,
    });

    expect(readStoredPeriodView(GAS_USE_VIEW_KEY)).toBeNull();
  });
});
