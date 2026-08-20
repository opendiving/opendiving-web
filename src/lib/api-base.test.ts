import { afterEach, describe, expect, it, vi } from "vitest";

import { apiCspSource, DEFAULT_API_BASE_URL } from "./api-base";

describe("apiCspSource", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for the shipped relative default, which 'self' already covers", () => {
    expect(apiCspSource(DEFAULT_API_BASE_URL)).toBeNull();
  });

  it("returns null for any relative base", () => {
    expect(apiCspSource("/api/v1")).toBeNull();
    expect(apiCspSource("/opendiving/api/v1")).toBeNull();
  });

  it("returns null when unset or blank", () => {
    expect(apiCspSource(undefined)).toBeNull();
    expect(apiCspSource("")).toBeNull();
    expect(apiCspSource("   ")).toBeNull();
  });

  it("reduces an absolute base to its origin, dropping the /api/v1 path", () => {
    expect(apiCspSource("https://api.example.com/api/v1")).toBe(
      "https://api.example.com",
    );
    expect(apiCspSource("http://localhost:8000/api/v1")).toBe(
      "http://localhost:8000",
    );
  });

  it("keeps a non-default port, which is part of the origin", () => {
    expect(apiCspSource("https://api.example.com:8443/api/v1")).toBe(
      "https://api.example.com:8443",
    );
  });

  it("fails closed on a value with no scheme at all", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(apiCspSource("api.example.com/api/v1")).toBeNull();
  });

  it("fails closed on a scheme typo, which parses but yields an opaque origin", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // "htp://" is a valid non-special scheme, so `new URL` accepts it and reports the
    // origin as the literal string "null" - which a browser discards as an invalid CSP
    // source without saying why.
    expect(apiCspSource("htp://api.example.com/api/v1")).toBeNull();
  });

  it("names the variable when it rejects a value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    apiCspSource("api.example.com");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("NEXT_PUBLIC_API_URL"),
    );
  });
});
