import { NextRequest } from "next/server";
import { config } from "./proxy";
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

  // The policy used to name `accounts.google.com` in `style-src`, `connect-src`
  // and `frame-src` wherever a client ID was set, because Google's sign-in script
  // injected a stylesheet and an iframe and called home from the page. No Google
  // code runs here now - the button is a top-level navigation, which no fetch
  // directive governs - so the origin is gone from every directive in *both*
  // configurations.
  //
  // Both halves are asserted deliberately. The configured one is the behaviour
  // change; the unconfigured one is the regression guard, since a re-added source
  // would be conditional again and a single unconfigured check would pass while
  // the policy named Google for every instance that actually uses it.
  it.each([
    ["configured", { GOOGLE_CLIENT_ID: "abc.apps.googleusercontent.com" }],
    ["unconfigured", {}],
  ])("names no Google origin when Google sign-in is %s", async (_l, env) => {
    const proxy = await loadProxy(env);

    const csp = proxy(request("https://dives.example.com/signin")).headers.get(
      "Content-Security-Policy",
    );

    expect(csp).toBeTruthy();
    expect(csp).not.toContain("google");
    expect(csp).not.toContain("gstatic");
  });

  // Reading one directive out of the header, so an assertion about `connect-src`
  // cannot be satisfied by a host that reached `img-src` instead.
  const directive = async (
    name: string,
    env: Record<string, string> = {},
  ): Promise<string> => {
    const proxy = await loadProxy(env);
    const csp =
      proxy(request("https://dives.example.com/sites")).headers.get(
        "Content-Security-Policy",
      ) ?? "";
    return (
      csp
        .split("; ")
        .find((entry) => entry.startsWith(`${name} `) || entry === name) ?? ""
    );
  };

  // **Load-bearing rather than declarative.** This policy emits no `child-src`,
  // so without this line a worker falls back to `script-src`, whose
  // `'strict-dynamic'` short-circuits the source list for anything not
  // parser-inserted - and `new Worker(url)` never is. The policy would then
  // permit a `blob:` worker with no violation at all, which is the exact hazard
  // MapLibre was kept out of this app over. `worker-src`'s own check has no such
  // carve-out.
  it("governs workers itself rather than letting them fall back", async () => {
    expect(await directive("worker-src")).toBe("worker-src 'self'");
  });

  it.each([
    ["worker-src", {}],
    ["worker-src", { MAP_TILE_URL: "https://tiles.example/{z}/{x}/{y}.png" }],
  ])("never admits a blob worker (%s, %j)", async (name, env) => {
    expect(await directive(name, env)).not.toContain("blob:");
  });

  // The basemap is a `connect-src` source in *both* modes: MapLibre's image
  // decoder takes an `ArrayBuffer` and goes `Blob` -> `createImageBitmap`, so
  // even raster tile bytes arrive by `fetch`.
  it("names the bundled basemap's provider by default", async () => {
    expect(await directive("connect-src")).toBe(
      "connect-src 'self' https://tiles.openfreemap.org",
    );
  });

  it("names a configured style's own origin", async () => {
    expect(
      await directive("connect-src", {
        MAP_STYLE_URL: "https://styles.example/day.json",
        MAP_ATTRIBUTION: "© Someone",
      }),
    ).toBe("connect-src 'self' https://styles.example");
  });

  it("names a raster escape hatch's host", async () => {
    expect(
      await directive("connect-src", {
        MAP_TILE_URL: "https://tiles.example/{z}/{x}/{y}.png",
      }),
    ).toBe("connect-src 'self' https://tiles.example");
  });

  // **`img-src` names no third party at all**, and the two assertions this
  // replaces said the opposite on purpose. They pinned the tile hosts' retention
  // for as long as the site picker drew raster `<img>` tiles, so that dropping
  // them would be a decision rather than an accident; the picker draws through
  // MapLibre now, which fetches every tile under `connect-src` in both of its
  // modes.
  //
  // What every `<img>` in this app points at is *this instance* - the page's own
  // origin, or `apiOrigin` where the API is split onto another one. That is not
  // the same claim as "its own origin", and species photos are why: they are
  // plain `<img src>` elements aimed straight at the API, since the route serving
  // them takes no token, so a split-origin build resolves them to `apiOrigin`.
  // The assertions below still hold, because `apiOrigin` is not a third party and
  // is not a basemap host either.
  it.each([
    ["by default", {}],
    [
      "with a raster escape hatch configured",
      {
        MAP_TILE_URL: "https://tiles.example/{z}/{x}/{y}.png",
      },
    ],
    [
      "with a style configured",
      {
        MAP_STYLE_URL: "https://styles.example/day.json",
        MAP_ATTRIBUTION: "© Someone",
      },
    ],
  ])("names no basemap host in img-src (%s)", async (_case, env) => {
    expect(await directive("img-src", env)).toBe("img-src 'self' data: blob:");
  });

  // The empty-source filtering that `cspList` does is easy to lose when a
  // directive stops taking a conditional source, and a doubled space reads as a
  // typo forever after.
  it("leaves no doubled spaces behind the sources it dropped", async () => {
    const proxy = await loadProxy();

    const csp = proxy(request("https://dives.example.com/")).headers.get(
      "Content-Security-Policy",
    );

    expect(csp).not.toMatch(/ {2}/);
    expect(csp).not.toMatch(/;\s*;/);
  });
});

describe("matcher", () => {
  // Next's own CSP guide pairs this matcher with a `missing:` clause skipping prefetch
  // requests; this app deliberately carries none, so that nothing a client puts in a
  // request can opt the response out of the policy. `src/proxy.ts` has the reasoning -
  // in short, a real prefetch payload has no nonce to go stale, and the clause was a
  // one-header way to be served a full HTML document with no CSP, no HSTS and no
  // `X-Robots-Tag`.
  //
  // Vitest never runs Next's matcher, so this can only be a static assertion about the
  // exported `config` - which is exactly why it is worth writing down. The guarantee is
  // four lines away from being handed back, and every other test here calls `proxy()`
  // directly, so not one of them would notice.
  it("gives no request header a way to opt out of the policy", () => {
    expect(config.matcher.length).toBeGreaterThan(0);

    for (const entry of config.matcher) {
      // The only two matcher keys that condition on the request itself. `source`
      // conditions on the path, which is what the exclusions in it are for.
      expect(entry).not.toHaveProperty("missing");
      expect(entry).not.toHaveProperty("has");
    }
  });
});
