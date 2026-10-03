import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readLegalPageConfig } from "./config.server";

// `connection()` is how these modules tell `cacheComponents` to stop prerendering, and
// it throws outside a request scope - which a unit test calling the function directly
// always is.
vi.mock("next/server", () => ({ connection: async () => {} }));

// Every one of these cases resolves rather than throws, and that is the thing under
// test: the legal pages call this while rendering, and an instance whose API is down
// must still serve them. What varies is only which answers are `true`.
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

const NONE = { projectOperated: false, joinLinks: false, mapPictures: false };

describe("readLegalPageConfig", () => {
  it("is true for each field only where the API said so", async () => {
    answers({
      registration_mode: "invite",
      project_operated: true,
      join_links: true,
      map_pictures: true,
    });
    await expect(readLegalPageConfig()).resolves.toEqual({
      projectOperated: true,
      joinLinks: true,
      mapPictures: true,
    });

    answers({ project_operated: false, join_links: true, map_pictures: false });
    await expect(readLegalPageConfig()).resolves.toEqual({
      projectOperated: false,
      joinLinks: true,
      mapPictures: false,
    });

    answers({ project_operated: false, join_links: false, map_pictures: true });
    await expect(readLegalPageConfig()).resolves.toEqual({
      projectOperated: false,
      joinLinks: false,
      mapPictures: true,
    });
  });

  // The literal comparison, not truthiness. An API that predates a field sends no key
  // at all, and a self-hoster's page must not turn on `undefined` being falsy by luck.
  it.each([
    [
      "the fields are false",
      {
        registration_mode: "open",
        project_operated: false,
        join_links: false,
        map_pictures: false,
      },
    ],
    ["the fields are absent", { registration_mode: "open" }],
    [
      "the fields are strings",
      { project_operated: "true", join_links: "true", map_pictures: "true" },
    ],
  ])("is false for every field when %s", async (_label, body) => {
    answers(body);

    await expect(readLegalPageConfig()).resolves.toEqual(NONE);
  });

  it("is false, not an error, when the API refuses", async () => {
    answers({}, { ok: false, status: 503 });

    await expect(readLegalPageConfig()).resolves.toEqual(NONE);
  });

  it("is false, not an error, when the API cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(readLegalPageConfig()).resolves.toEqual(NONE);
  });

  it("is false, not an error, when the answer is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    });

    await expect(readLegalPageConfig()).resolves.toEqual(NONE);
  });

  // The request itself: the internal address rather than a relative path a server has no
  // origin for, the `/api/v1` prefix the route carries, no caching, and a signal - a
  // fetch that hangs would hold the page open rather than failing it.
  it("asks the API container directly, uncached, with a deadline", async () => {
    answers({ project_operated: true });

    await readLegalPageConfig();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https?:\/\/[^/]+\/api\/v1\/config$/);
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
