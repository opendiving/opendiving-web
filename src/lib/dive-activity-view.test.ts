import { beforeEach, describe, expect, it } from "vitest";
import {
  parseDiveActivityView,
  readStoredDiveActivityView,
  writeDiveActivityView,
} from "@/lib/dive-activity-view";
import { memoryStorage, useStorage } from "@/test/memory-storage";

// The anchor is the start of a day the diver had dives on - what the card stores
// and what `resolveAnchor` (in `chart-period.ts`, tested there) checks back
// against the logbook.
const APRIL_8 = Date.UTC(2025, 3, 8);

// The pair the card actually composes: read the raw entry, then parse it.
function readDiveActivityView() {
  return parseDiveActivityView(readStoredDiveActivityView());
}

const KEY = "opendiving:dive-activity-view";

// `window.localStorage` is installed per test rather than used as jsdom provides
// it - see `test/memory-storage.ts` for why.
describe("readStoredDiveActivityView / writeDiveActivityView", () => {
  beforeEach(() => {
    useStorage(memoryStorage());
  });

  it("round-trips a view", () => {
    writeDiveActivityView({ scope: "month", anchor: APRIL_8 });

    expect(readDiveActivityView()).toEqual({
      scope: "month",
      anchor: APRIL_8,
    });
  });

  it("round-trips the never-picked-a-period case", () => {
    // Null is a real value here, not an absence: it means "follow the most
    // recent diving", which keeps working as the diver logs into a new season.
    writeDiveActivityView({ scope: "year", anchor: null });

    expect(readDiveActivityView()).toEqual({ scope: "year", anchor: null });
  });

  it("does not collide with the gas card's remembered view", () => {
    // Two cards, two keys. The two now store the same *shape*, which is exactly
    // why they must not share an entry: each card's write would otherwise have
    // to preserve the other's period.
    writeDiveActivityView({ scope: "month", anchor: APRIL_8 });

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
    // A stale entry from a build whose scopes were named differently. Restoring
    // it would light no button in the segmented control at all.
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ scope: "season", anchor: null }),
    );

    expect(readDiveActivityView()).toBeNull();
  });

  it("ignores an anchor that isn't a finite number", () => {
    // Anything here reaches a `<Select>` value and a `Date`; a non-number
    // matches no option and renders an empty trigger.
    for (const anchor of ["2025", true, {}, []]) {
      window.localStorage.setItem(
        KEY,
        JSON.stringify({ scope: "month", anchor }),
      );
      expect(readDiveActivityView()).toBeNull();
    }
  });

  it("ignores a view with no anchor key at all", () => {
    // Distinct from a stored `null`, which this module writes and which means
    // "follow the most recent diving". An absent key is a shape we never write -
    // and it is also the shape of the `{ scope, year }` entries an older build
    // left behind, which are rejected whole rather than migrated.
    window.localStorage.setItem(KEY, JSON.stringify({ scope: "month" }));
    expect(readDiveActivityView()).toBeNull();

    window.localStorage.setItem(
      KEY,
      JSON.stringify({ scope: "year", year: 2025 }),
    );
    expect(readDiveActivityView()).toBeNull();
  });

  it("reads a stored NaN as no period picked", () => {
    // Not a gap in the validation above: `JSON.stringify` turns `NaN` into
    // `null`, so it cannot survive being written. Pinned so nobody "fixes" the
    // validator to reject something that can't arrive.
    writeDiveActivityView({ scope: "month", anchor: NaN });

    expect(readDiveActivityView()).toEqual({ scope: "month", anchor: null });
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
      writeDiveActivityView({ scope: "month", anchor: APRIL_8 }),
    ).not.toThrow();
    expect(readDiveActivityView()).toBeNull();
  });

  it("survives storage not being there at all", () => {
    // Reaching through a missing `window.localStorage` is a `TypeError`, not a
    // storage error - and it is exactly the state this runner starts in.
    useStorage(undefined);

    expect(() =>
      writeDiveActivityView({ scope: "month", anchor: APRIL_8 }),
    ).not.toThrow();
    expect(readDiveActivityView()).toBeNull();
  });
});
