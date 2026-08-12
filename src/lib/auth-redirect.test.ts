import { describe, expect, it, beforeEach } from "vitest";
import {
  consumePostAuthRedirect,
  rememberPostAuthRedirect,
  sanitizeRedirectPath,
  signInHref,
} from "./auth-redirect";

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

describe("rememberPostAuthRedirect / consumePostAuthRedirect", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("round-trips a destination exactly once", () => {
    rememberPostAuthRedirect("/dives/abc");
    expect(consumePostAuthRedirect()).toBe("/dives/abc");
    expect(consumePostAuthRedirect()).toBeNull();
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
});
