import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { proxyToApi, resolveApiInternalUrl } from "./api-proxy";

const INTERNAL = "http://api.test:8000";

function fetchMock(response: Response = new Response("{}", { status: 200 })) {
  const mock = vi.fn(async () => response);
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** The `RequestInit` the handler passed to `fetch`, typed for the assertions below. */
function initOf(mock: ReturnType<typeof fetchMock>) {
  return (
    mock.mock.calls[0] as unknown as [string, RequestInit & { duplex?: string }]
  )[1];
}

function targetOf(mock: ReturnType<typeof fetchMock>) {
  return (mock.mock.calls[0] as unknown as [string, RequestInit])[0];
}

describe("resolveApiInternalUrl", () => {
  it("prefers an explicit API_INTERNAL_URL", () => {
    expect(resolveApiInternalUrl({ API_INTERNAL_URL: INTERNAL })).toBe(
      INTERNAL,
    );
  });

  it("strips trailing slashes, so the appended path never doubles one", () => {
    expect(
      resolveApiInternalUrl({ API_INTERNAL_URL: "http://api:8000//" }),
    ).toBe("http://api:8000");
  });

  it("ignores a blank value rather than dialling an empty host", () => {
    expect(resolveApiInternalUrl({ API_INTERNAL_URL: "  " })).toBe(
      "http://localhost:8000",
    );
  });

  it("falls back to the compose service name in production", () => {
    expect(resolveApiInternalUrl({ NODE_ENV: "production" })).toBe(
      "http://api:8000",
    );
  });

  it("falls back to the API's published port under next dev", () => {
    expect(resolveApiInternalUrl({ NODE_ENV: "development" })).toBe(
      "http://localhost:8000",
    );
  });
});

describe("proxyToApi", () => {
  beforeEach(() => {
    vi.stubEnv("API_INTERNAL_URL", INTERNAL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("forwards method, path and query to the internal URL", async () => {
    const mock = fetchMock();

    await proxyToApi(
      new NextRequest("http://web.test/api/v1/dive?page=2&items_per_page=10"),
    );

    expect(targetOf(mock)).toBe(
      `${INTERNAL}/api/v1/dive?page=2&items_per_page=10`,
    );
    expect(initOf(mock).method).toBe("GET");
  });

  it("keeps percent-encoded path segments intact", async () => {
    const mock = fetchMock();

    await proxyToApi(
      new NextRequest("http://web.test/api/v1/dive-site/a%2Fb%20c"),
    );

    expect(targetOf(mock)).toBe(`${INTERNAL}/api/v1/dive-site/a%2Fb%20c`);
  });

  it("streams a request body through without buffering it", async () => {
    const mock = fetchMock();

    await proxyToApi(
      new NextRequest("http://web.test/api/v1/dive", {
        method: "POST",
        body: '{"dive_number":1}',
        headers: { "content-type": "application/json" },
      }),
    );

    const init = initOf(mock);
    expect(init.body).toBeInstanceOf(ReadableStream);
    // undici refuses a stream body without it.
    expect(init.duplex).toBe("half");
    expect(await new Response(init.body).text()).toBe('{"dive_number":1}');
  });

  it("sends no body, and no duplex, for a GET", async () => {
    const mock = fetchMock();

    await proxyToApi(new NextRequest("http://web.test/api/v1/user"));

    expect(initOf(mock).body).toBeNull();
    expect(initOf(mock).duplex).toBeUndefined();
  });

  it("does not follow redirects or cache, and cancels with the caller", async () => {
    const mock = fetchMock();
    const request = new NextRequest("http://web.test/api/v1/user");

    await proxyToApi(request);

    const init = initOf(mock);
    expect(init.redirect).toBe("manual");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBe(request.signal);
  });

  it("passes the forwarding chain through for the API's per-IP rate limits", async () => {
    const mock = fetchMock();

    await proxyToApi(
      new NextRequest("http://web.test/api/v1/auth/email/request", {
        method: "POST",
        headers: {
          "x-forwarded-for": "203.0.113.7, 10.0.0.2",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "dive.example.com",
        },
      }),
    );

    const headers = initOf(mock).headers as Headers;
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7, 10.0.0.2");
    expect(headers.get("x-forwarded-proto")).toBe("https");
    expect(headers.get("x-forwarded-host")).toBe("dive.example.com");
  });

  it("derives proto and host from the request when they are absent", async () => {
    const mock = fetchMock();

    await proxyToApi(new NextRequest("https://dive.example.com/api/v1/user"));

    const headers = initOf(mock).headers as Headers;
    expect(headers.get("x-forwarded-proto")).toBe("https");
    expect(headers.get("x-forwarded-host")).toBe("dive.example.com");
    // Nothing to invent one from - a route handler cannot see the socket peer.
    expect(headers.get("x-forwarded-for")).toBeNull();
  });

  it("forwards the Authorization header and the request cookies", async () => {
    const mock = fetchMock();

    await proxyToApi(
      new NextRequest("http://web.test/api/v1/auth/refresh", {
        method: "POST",
        headers: {
          authorization: "Bearer token-abc",
          cookie: "refresh_token=abc; theme=dark",
        },
      }),
    );

    const headers = initOf(mock).headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer token-abc");
    expect(headers.get("cookie")).toBe("refresh_token=abc; theme=dark");
  });

  it("strips hop-by-hop headers, the ones Connection names, and the rewritten ones", async () => {
    const mock = fetchMock();

    await proxyToApi(
      new NextRequest("http://web.test/api/v1/dive", {
        method: "POST",
        body: "x",
        headers: {
          connection: "keep-alive, X-Custom-Hop",
          "keep-alive": "timeout=5",
          "transfer-encoding": "chunked",
          "x-custom-hop": "gone",
          "accept-encoding": "gzip",
          "content-length": "1",
        },
      }),
    );

    const headers = initOf(mock).headers as Headers;
    for (const name of [
      "connection",
      "keep-alive",
      "transfer-encoding",
      "x-custom-hop",
      "accept-encoding",
      "content-length",
      "host",
    ]) {
      expect(headers.get(name)).toBeNull();
    }
  });

  it("drops Expect, which undici refuses outright", async () => {
    const mock = fetchMock();

    await proxyToApi(
      new NextRequest("http://web.test/api/v1/dive/x/file", {
        method: "PUT",
        body: "bytes",
        headers: { expect: "100-continue" },
      }),
    );

    // Not cosmetic: forwarded, this fails the whole request with
    // UND_ERR_NOT_SUPPORTED, which is a 502 for every large curl upload.
    expect((initOf(mock).headers as Headers).get("expect")).toBeNull();
  });

  it("passes every Set-Cookie through separately", async () => {
    const upstream = new Response("{}", { status: 200 });
    upstream.headers.append(
      "set-cookie",
      "refresh_token=abc; Path=/; HttpOnly; Secure; SameSite=lax; Expires=Wed, 21 Oct 2026 07:28:00 GMT",
    );
    upstream.headers.append("set-cookie", "other=1; Path=/");
    fetchMock(upstream);

    const response = await proxyToApi(
      new NextRequest("http://web.test/api/v1/auth/refresh", {
        method: "POST",
      }),
    );

    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain("refresh_token=abc");
    expect(cookies[0]).toContain("Expires=Wed, 21 Oct 2026 07:28:00 GMT");
    expect(cookies[1]).toContain("other=1");
  });

  it("passes the status, status text and body of the response back", async () => {
    fetchMock(
      new Response('{"detail":"Dive not found"}', {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await proxyToApi(
      new NextRequest("http://web.test/api/v1/dive/x"),
    );

    expect(response.status).toBe(404);
    expect(response.statusText).toBe("Not Found");
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ detail: "Dive not found" });
  });

  it("keeps Content-Disposition, which is what names a downloaded file", async () => {
    fetchMock(
      new Response("bytes", {
        headers: { "content-disposition": 'attachment; filename="dive.uddf"' },
      }),
    );

    const response = await proxyToApi(
      new NextRequest("http://web.test/api/v1/export/uddf"),
    );

    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="dive.uddf"',
    );
  });

  it("drops a response's content-encoding, which fetch has already decoded away", async () => {
    fetchMock(
      new Response("plain", {
        headers: { "content-encoding": "gzip", "content-length": "17" },
      }),
    );

    const response = await proxyToApi(
      new NextRequest("http://web.test/api/v1/dive"),
    );

    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
  });

  it("keeps content-length when the body was never encoded", async () => {
    fetchMock(new Response("plain", { headers: { "content-length": "5" } }));

    const response = await proxyToApi(
      new NextRequest("http://web.test/api/v1/dive"),
    );

    expect(response.headers.get("content-length")).toBe("5");
  });

  it("returns a bodiless 204 rather than throwing on one", async () => {
    fetchMock(new Response(null, { status: 204 }));

    const response = await proxyToApi(
      new NextRequest("http://web.test/api/v1/dive/x", { method: "DELETE" }),
    );

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it("answers a HEAD with headers only", async () => {
    fetchMock(
      new Response("ignored", { headers: { "content-type": "text/plain" } }),
    );

    const response = await proxyToApi(
      new NextRequest("http://web.test/api/v1/dive", { method: "HEAD" }),
    );

    expect(response.body).toBeNull();
    expect(response.headers.get("content-type")).toBe("text/plain");
  });

  it("answers 502 with a FastAPI-shaped body when the API is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND api");
      }),
    );

    const response = await proxyToApi(
      new NextRequest("http://web.test/api/v1/user"),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      detail: expect.stringContaining("unreachable"),
    });
  });

  it("keeps the query string out of that log, where sign-in tokens live", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    );

    await proxyToApi(
      new NextRequest(
        "http://web.test/api/v1/auth/email/verify/check?token=live-single-use-token",
      ),
    );

    // The precheck never reached the API, so that token is still valid - which is
    // exactly what makes this branch the one where logging it matters.
    const logged = error.mock.calls[0].join(" ");
    expect(logged).not.toContain("live-single-use-token");
    expect(logged).toContain("/api/v1/auth/email/verify/check");
  });
});
