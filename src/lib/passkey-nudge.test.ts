import { beforeEach, describe, expect, it } from "vitest";
import {
  dismissPasskeyNudge,
  isPasskeyNudgeDismissed,
  restorePasskeyNudge,
} from "./passkey-nudge";
import { memoryStorage, useStorage } from "@/test/memory-storage";

// `window.localStorage` is installed per test rather than used as jsdom provides
// it - see `test/memory-storage.ts` for why.
beforeEach(() => {
  useStorage(memoryStorage());
});

describe("dismissPasskeyNudge / isPasskeyNudgeDismissed", () => {
  it("offers the nudge to a browser that has never seen it", () => {
    expect(isPasskeyNudgeDismissed()).toBe(false);
  });

  it("remembers a dismissal", () => {
    dismissPasskeyNudge();

    expect(isPasskeyNudgeDismissed()).toBe(true);
  });

  // Showing the card again is the harmless side of a storage failure: the diver
  // dismisses it a second time, where the other way round would mean never
  // offering a passkey at all.
  it("keeps offering when the browser refuses storage", () => {
    useStorage(undefined);

    expect(() => dismissPasskeyNudge()).not.toThrow();
    expect(isPasskeyNudgeDismissed()).toBe(false);
  });
});

describe("restorePasskeyNudge", () => {
  it("puts a dismissed browser back where it started", () => {
    dismissPasskeyNudge();

    restorePasskeyNudge();

    expect(isPasskeyNudgeDismissed()).toBe(false);
    // Removed rather than set to some "show me" value: absence is already what
    // an undismissed browser looks like, and a second stored state would mean
    // the same as no stored state.
    expect(
      window.localStorage.getItem("opendiving:passkey-nudge-dismissed"),
    ).toBeNull();
  });

  it("is harmless on a browser that never dismissed anything", () => {
    expect(() => restorePasskeyNudge()).not.toThrow();
    expect(isPasskeyNudgeDismissed()).toBe(false);
  });

  it("says nothing when the browser refuses storage", () => {
    useStorage(undefined);

    expect(() => restorePasskeyNudge()).not.toThrow();
  });
});
