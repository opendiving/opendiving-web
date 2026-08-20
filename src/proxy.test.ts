import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A fresh copy of the middleware for a given environment.
 *
 * Both `src/proxy.ts` and `lib/runtime-config.ts` memoize at module scope - deliberately,
 * since the environment cannot change while a real process lives - so a test that wants a
 * different configuration has to get a different module instance.
 */
async function loadProxy(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return (await import("./proxy")).proxy;
}

function request(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Strict-Transport-Security", () => {
  it("is sent for a request a proxy terminated as HTTPS", async () => {
    const proxy = await loadProxy();

    const response = proxy(
      request("http://dives.example.com/dashboard", {
        "x-forwarded-proto": "https",
      }),
    );

    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
  });

  // The whole reason it moved out of `next.config.js`: a build-time header is sent to a
  // LAN instance too, and a browser that records the pin can no longer reach it.
  it("is not sent over plain HTTP", async () => {
    const proxy = await loadProxy();

    const response = proxy(request("http://dives.local:3000/dashboard"));

    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
  });

  it("reads the client-facing hop of a forwarded chain, not the last one", async () => {
    const proxy = await loadProxy();

    const plain = proxy(
      request("http://dives.example.com/dashboard", {
        "x-forwarded-proto": "http, https",
      }),
    );
    const secure = proxy(
      request("http://dives.example.com/dashboard", {
        "x-forwarded-proto": "https, http",
      }),
    );

    expect(plain.headers.get("Strict-Transport-Security")).toBeNull();
    expect(secure.headers.get("Strict-Transport-Security")).not.toBeNull();
  });

  it("falls back to the request's own scheme when nothing forwarded one", async () => {
    const proxy = await loadProxy();

    const response = proxy(request("https://dives.example.com/dashboard"));

    expect(response.headers.get("Strict-Transport-Security")).not.toBeNull();
  });

  it("no longer offers `preload`", async () => {
    const proxy = await loadProxy();

    const response = proxy(
      request("https://dives.example.com/dashboard", {
        "x-forwarded-proto": "https",
      }),
    );

    expect(response.headers.get("Strict-Transport-Security")).not.toContain(
      "preload",
    );
  });

  it("is dropped entirely by WEB_HSTS=off", async () => {
    const proxy = await loadProxy({ WEB_HSTS: "off" });

    const response = proxy(
      request("https://dives.example.com/dashboard", {
        "x-forwarded-proto": "https",
      }),
    );

    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
  });
});

describe("X-Robots-Tag", () => {
  it("is absent by default, which is what a public instance wants", async () => {
    const proxy = await loadProxy();

    const response = proxy(request("https://dives.example.com/"));

    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });

  // `robots.txt` asks a crawler not to fetch; only this keeps a URL it heard about
  // elsewhere out of an index.
  it("is sent on every response when WEB_NOINDEX is set", async () => {
    const proxy = await loadProxy({ WEB_NOINDEX: "true" });

    const response = proxy(request("https://dives.example.com/"));

    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
});

describe("Content-Security-Policy", () => {
  // Unchanged by the headers above, and the one this middleware exists for.
  it("still carries a per-request nonce", async () => {
    const proxy = await loadProxy();

    const first = proxy(request("https://dives.example.com/"));
    const second = proxy(request("https://dives.example.com/"));

    const nonceOf = (value: string | null) =>
      value?.match(/'nonce-([^']+)'/)?.[1];

    expect(nonceOf(first.headers.get("Content-Security-Policy"))).toBeTruthy();
    expect(nonceOf(first.headers.get("Content-Security-Policy"))).not.toBe(
      nonceOf(second.headers.get("Content-Security-Policy")),
    );
  });
});
