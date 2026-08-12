import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import {
  consumePostAuthRedirect,
  rememberPostAuthRedirect,
  sanitizeRedirectPath,
  signInHref,
} from "./auth-redirect";
import { memoryStorage, useStorage } from "@/test/memory-storage";

describe("sanitizeRedirectPath", () => {
  it("keeps a same-origin path", () => {
    expect(sanitizeRedirectPath("/dives/abc?page=2")).toBe("/dives/abc?page=2");
  });

  it("rejects empty/missing values", () => {
    expect(sanitizeRedirectPath(null)).toBeNull();
    expect(sanitizeRedirectPath(undefined)).toBeNull();
    expect(sanitizeRedirectPath("")).toBeNull();
  });

  it("rejects anything a browser could read as another origin", () => {
    expect(sanitizeRedirectPath("https://evil.example")).toBeNull();
    expect(sanitizeRedirectPath("//evil.example")).toBeNull();
    expect(sanitizeRedirectPath("/\\evil.example")).toBeNull();
    expect(sanitizeRedirectPath("dives")).toBeNull();
  });

  // The URL parser strips ASCII tab/newline/carriage-return *before* parsing,
  // so "/\t/evil.example" is not caught by the "//" check above yet still
  // resolves to https://evil.example/. Asserted against the real parser rather
  // than by eyeballing the string, since that stripping is the whole point.
  it("rejects control characters that the URL parser strips out", () => {
    for (const control of ["\t", "\n", "\r"]) {
      const crafted = `/${control}/evil.example`;

      expect(
        new URL(crafted, "https://opendiving.app/").origin,
        `"${JSON.stringify(control)}" must be treated as cross-origin`,
      ).toBe("https://evil.example");

      expect(sanitizeRedirectPath(crafted)).toBeNull();
    }
  });

  it("rejects control characters anywhere in the value, not just up front", () => {
    expect(sanitizeRedirectPath("/dives\n//evil.example")).toBeNull();
    expect(sanitizeRedirectPath("/dives\t")).toBeNull();
  });

  it("rejects a leading space, which the parser also trims", () => {
    expect(sanitizeRedirectPath(" //evil.example")).toBeNull();
    expect(sanitizeRedirectPath(" /dives")).toBeNull();
  });

  it("still keeps ordinary paths with query strings and fragments", () => {
    expect(sanitizeRedirectPath("/dives/abc?page=2#top")).toBe(
      "/dives/abc?page=2#top",
    );
    expect(sanitizeRedirectPath("/sites/a%20b")).toBe("/sites/a%20b");
  });
});

describe("signInHref", () => {
  it("appends an encoded next parameter", () => {
    expect(signInHref("/dives/abc?page=2")).toBe(
      "/signin?next=%2Fdives%2Fabc%3Fpage%3D2",
    );
  });

  it("omits next when there's nothing worth returning to", () => {
    expect(signInHref(null)).toBe("/signin");
    expect(signInHref("/")).toBe("/signin");
    expect(signInHref("https://evil.example")).toBe("/signin");
  });

  it("never points back at the sign-in page itself", () => {
    expect(signInHref("/signin?next=%2Fdives")).toBe("/signin");
  });
});

const STORAGE_KEY = "opendiving:post-auth-redirect";

// `window.localStorage` is installed per test rather than used as jsdom provides
// it - see `test/memory-storage.ts` for why. Here it also has to be swappable
// per test, since two below are about the browser refusing storage outright.
describe("rememberPostAuthRedirect / consumePostAuthRedirect", () => {
  beforeEach(() => {
    useStorage(memoryStorage());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a destination exactly once", () => {
    rememberPostAuthRedirect("/dives/abc");
    expect(consumePostAuthRedirect()).toBe("/dives/abc");
    expect(consumePostAuthRedirect()).toBeNull();
  });

  // The point of the storage is that the emailed link opens in a browsing
  // context with no opener - one that gets a `sessionStorage` of its own but
  // shares `localStorage` with the tab that asked for the link. jsdom has only
  // the one context, so what's actually pinned here is the mechanism: the
  // destination is in `localStorage` and nowhere else.
  it("keeps the destination in localStorage, not the tab's own storage", () => {
    rememberPostAuthRedirect("/dives/abc");

    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("clears any earlier destination when called without one", () => {
    rememberPostAuthRedirect("/dives/abc");
    rememberPostAuthRedirect(undefined);
    expect(consumePostAuthRedirect()).toBeNull();
  });

  it("refuses to store an off-origin destination", () => {
    rememberPostAuthRedirect("https://evil.example");
    expect(consumePostAuthRedirect()).toBeNull();
  });

  // `localStorage` outlives the tab, so a destination nobody ever came back for
  // must not sit there indefinitely. The window is deliberately far longer than
  // any link's life - see the constant for why erring long is the safe side.
  it("forgets a destination once it's a day old", () => {
    vi.useFakeTimers();
    rememberPostAuthRedirect("/dives/abc");

    vi.advanceTimersByTime(23 * 60 * 60 * 1000);
    const stillLive = window.localStorage.getItem(STORAGE_KEY);
    expect(consumePostAuthRedirect()).toBe("/dives/abc");

    // Put it back untouched and let it age out.
    window.localStorage.setItem(STORAGE_KEY, stillLive!);
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);

    expect(consumePostAuthRedirect()).toBeNull();
  });

  it("ignores - and clears - an entry it can't read", () => {
    // Anything not written by `rememberPostAuthRedirect`: a hand-edited entry, a
    // half-written value, a future format read by an older tab.
    window.localStorage.setItem(STORAGE_KEY, "/dives/abc");

    expect(consumePostAuthRedirect()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  // Safari private mode, storage disabled by policy, quota exhausted. Losing the
  // destination is the accepted outcome; taking the sign-in down with it is not.
  it("survives storage that throws", () => {
    const denied: Storage = {
      ...memoryStorage(),
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    useStorage(denied);

    expect(() => rememberPostAuthRedirect("/dives/abc")).not.toThrow();
    expect(consumePostAuthRedirect()).toBeNull();
  });

  it("survives storage that isn't there at all", () => {
    useStorage(undefined);

    expect(() => rememberPostAuthRedirect("/dives/abc")).not.toThrow();
    expect(consumePostAuthRedirect()).toBeNull();
  });
});
