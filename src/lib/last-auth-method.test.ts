import { beforeEach, describe, expect, it } from "vitest";
import { rememberAuthMethod, readLastAuthMethod } from "./last-auth-method";
import { memoryStorage, useStorage } from "@/test/memory-storage";

const STORAGE_KEY = "opendiving:last-auth-method";

// `window.localStorage` is installed per test rather than used as jsdom provides
// it - see `test/memory-storage.ts` for why. Swappable per test here as well,
// since two below are about a browser that hands out no storage at all.
beforeEach(() => {
  useStorage(memoryStorage());
});

describe("rememberAuthMethod / readLastAuthMethod", () => {
  it("reads back the method that was written", () => {
    rememberAuthMethod("passkey");

    expect(readLastAuthMethod()).toBe("passkey");
  });

  it("keeps only the most recent one", () => {
    rememberAuthMethod("google");
    rememberAuthMethod("email");

    expect(readLastAuthMethod()).toBe("email");
  });

  it("has nothing to say before a first sign-in", () => {
    expect(readLastAuthMethod()).toBeNull();
  });

  // The value is only ever rendered, so anything outside the known set has to
  // read as absent - a build that drops a method should say nothing rather than
  // name one it no longer offers, and a hand-edited entry is not a crash.
  it("ignores a value this build doesn't know", () => {
    window.localStorage.setItem(STORAGE_KEY, "sms");

    expect(readLastAuthMethod()).toBeNull();
  });

  // Safari private mode, storage disabled, quota. The hint is a line of copy;
  // losing it must not cost a sign-in.
  it("survives a browser that refuses storage", () => {
    useStorage(undefined);

    expect(() => rememberAuthMethod("email")).not.toThrow();
    expect(readLastAuthMethod()).toBeNull();
  });
});
