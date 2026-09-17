import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { projectOperatesThisInstance } from "./config.server";

// `connection()` is how these modules tell `cacheComponents` to stop prerendering, and
// it throws outside a request scope - which a unit test calling the function directly
// always is.
vi.mock("next/server", () => ({ connection: async () => {} }));

// Every one of these cases resolves rather than throws, and that is the thing under
// test: the legal pages call this while rendering, and an instance whose API is down
// must still serve them. What varies is only whether the answer is `true`.
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

function answers(body: unknown, { ok = true, status = 200 } = {}) {
  fetchMock.mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

describe("projectOperatesThisInstance", () => {
  it("is true only when the API said so", async () => {
    answers({ registration_mode: "invite", project_operated: true });

    await expect(projectOperatesThisInstance()).resolves.toBe(true);
  });

  // The literal comparison, not truthiness. An API that predates the field sends no key
  // at all, and a self-hoster's page must not turn on `undefined` being falsy by luck.
  it.each([
    [
      "the field is false",
      { registration_mode: "open", project_operated: false },
    ],
    ["the field is absent", { registration_mode: "open" }],
    ["the field is a string", { project_operated: "true" }],
  ])("is false when %s", async (_label, body) => {
    answers(body);

    await expect(projectOperatesThisInstance()).resolves.toBe(false);
  });

  it("is false, not an error, when the API refuses", async () => {
    answers({}, { ok: false, status: 503 });

    await expect(projectOperatesThisInstance()).resolves.toBe(false);
  });

  it("is false, not an error, when the API cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(projectOperatesThisInstance()).resolves.toBe(false);
  });

  it("is false, not an error, when the answer is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    });

    await expect(projectOperatesThisInstance()).resolves.toBe(false);
  });

  // The request itself: the internal address rather than a relative path a server has no
  // origin for, the `/api/v1` prefix the route carries, no caching, and a signal - a
  // fetch that hangs would hold the page open rather than failing it.
  it("asks the API container directly, uncached, with a deadline", async () => {
    answers({ project_operated: true });

    await projectOperatesThisInstance();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https?:\/\/[^/]+\/api\/v1\/config$/);
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
