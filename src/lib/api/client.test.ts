import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import {
  apiClient,
  fetchAllPages,
  isAbortError,
  unwrapBlobErrorBody,
  type PaginatedResponse,
} from "./client";
import { getApiErrorMessage } from "./error";

// A stand-in list endpoint over a fixed array of items, paged the way the API
// pages: `has_more` is `page * items_per_page < total_count`, and `items_per_page`
// is clamped to 100.
function pagedSource<T>(items: T[]) {
  return vi.fn(
    async (
      page: number,
      itemsPerPage: number,
    ): Promise<PaginatedResponse<T>> => {
      const perPage = Math.min(itemsPerPage, 100);
      const start = (page - 1) * perPage;
      return {
        data: items.slice(start, start + perPage),
        total_count: items.length,
        has_more: page * perPage < items.length,
        page,
        items_per_page: perPage,
      };
    },
  );
}

const ids = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => ({ uuid: `id-${i + offset}` }));

// The pairing that matters: `getApiErrorMessage` reads `response.data.detail`,
// and a `responseType: "blob"` request wraps the *error* body in a Blob too, so
// without the unwrap every binary call site silently shows its fallback.
function blobError(body: string, type = "application/json") {
  return { response: { data: new Blob([body], { type }) } };
}

describe("unwrapBlobErrorBody", () => {
  it("replaces a blob-wrapped JSON error body with the parsed object", async () => {
    const error = blobError('{"detail": "This dive has no profile"}');

    await unwrapBlobErrorBody(error);

    expect(error.response.data).toEqual({ detail: "This dive has no profile" });
  });

  it("makes getApiErrorMessage surface the API's real message", async () => {
    const error = blobError(
      '{"detail": "No front image for this certification"}',
    );

    await unwrapBlobErrorBody(error);

    expect(getApiErrorMessage(error, "Couldn't load image")).toBe(
      "No front image for this certification",
    );
  });

  it("leaves a genuinely binary error body alone rather than throwing", async () => {
    const error = blobError("\x89PNG-ish bytes", "image/png");

    await expect(unwrapBlobErrorBody(error)).resolves.toBeUndefined();

    expect(error.response.data).toBeInstanceOf(Blob);
    expect(getApiErrorMessage(error, "Couldn't load image")).toBe(
      "Couldn't load image",
    );
  });

  it("leaves a plain JSON error body untouched", async () => {
    const error = { response: { data: { detail: "Already an object" } } };

    await unwrapBlobErrorBody(error);

    expect(error.response.data).toEqual({ detail: "Already an object" });
  });

  it("tolerates an error with no response at all (network failure)", async () => {
    await expect(
      unwrapBlobErrorBody(new Error("Network Error")),
    ).resolves.toBeUndefined();
    await expect(unwrapBlobErrorBody(undefined)).resolves.toBeUndefined();
  });
});

describe("fetchAllPages", () => {
  it("walks every page and returns the items as one list", async () => {
    const fetchPage = pagedSource(ids(250));

    const all = await fetchAllPages(fetchPage);

    expect(all).toHaveLength(250);
    expect(all[0].uuid).toBe("id-0");
    expect(all[all.length - 1].uuid).toBe("id-249");
    // 3 pages of 100, and it stops as soon as `has_more` is false rather than
    // making a fourth request to discover the list is empty.
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("makes a single request when the first page is the whole list", async () => {
    const fetchPage = pagedSource(ids(4));

    expect(await fetchAllPages(fetchPage)).toHaveLength(4);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("stops at maxPages and warns rather than looping", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // An endpoint that always claims there is more - what an unbounded
    // `while (hasMore)` loop would follow forever.
    const fetchPage = vi.fn(async (page: number) => ({
      data: ids(100, page * 100),
      total_count: 10_000,
      has_more: true,
      page,
      items_per_page: 100,
    }));

    const all = await fetchAllPages(fetchPage, { maxPages: 3, label: "dives" });

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(all).toHaveLength(300);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("dives"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("truncated"));
    warn.mockRestore();
  });

  it("drops items repeated across pages when given a key", async () => {
    // What a 60s per-page cache produces: an insert between requests shifts every
    // later row down one, so the boundary item is served on both pages.
    const fetchPage = vi.fn(async (page: number) => ({
      data: page === 1 ? ids(2) : [{ uuid: "id-1" }, { uuid: "id-2" }],
      total_count: 4,
      has_more: page === 1,
      page,
      items_per_page: 2,
    }));

    const all = await fetchAllPages(fetchPage, {
      itemsPerPage: 2,
      keyOf: (item) => item.uuid,
    });

    expect(all.map((i) => i.uuid)).toEqual(["id-0", "id-1", "id-2"]);
  });

  it("keeps duplicates when no key is given", async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      data: [{ uuid: "same" }],
      total_count: 2,
      has_more: page === 1,
      page,
      items_per_page: 1,
    }));

    expect(await fetchAllPages(fetchPage, { itemsPerPage: 1 })).toHaveLength(2);
  });

  it("stops between pages once the signal aborts", async () => {
    const controller = new AbortController();
    const fetchPage = vi.fn(async (page: number, itemsPerPage: number) => {
      // Whatever unmounted the caller fires during the first request.
      controller.abort();
      return {
        data: ids(itemsPerPage),
        total_count: 1000,
        has_more: true,
        page,
        items_per_page: itemsPerPage,
      };
    });

    await expect(
      fetchAllPages(fetchPage, { signal: controller.signal }),
    ).rejects.toSatisfy(isAbortError);

    // The in-flight page still completed; the point is that page 2 was never asked for.
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("does not fetch at all when the signal is already aborted", async () => {
    const fetchPage = pagedSource(ids(10));

    await expect(
      fetchAllPages(fetchPage, { signal: AbortSignal.abort() }),
    ).rejects.toSatisfy(isAbortError);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("lets a real failure propagate rather than returning a short list", async () => {
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 2) throw new Error("500");
      return {
        data: ids(100),
        total_count: 300,
        has_more: true,
        page,
        items_per_page: 100,
      };
    });

    await expect(fetchAllPages(fetchPage)).rejects.toThrow("500");
  });
});

describe("isAbortError", () => {
  it("recognises an abort and nothing else", () => {
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("Network Error"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});

// The interceptor is attached to a module singleton, so it is reached by swapping
// the *adapter* out from under it rather than by calling it directly. Two adapters
// matter: `apiClient`'s answers the call under test, and the bare `axios` one
// answers `refreshAccessToken`'s own request - which is the thing these tests are
// really about, since a regression sends the caller down that path instead.
const originalAdapters = [apiClient.defaults.adapter, axios.defaults.adapter];

function rejectWith(status: number, data: unknown) {
  return vi.fn(async (config: unknown) => {
    throw { config, response: { status, data } };
  });
}

afterEach(() => {
  [apiClient.defaults.adapter, axios.defaults.adapter] = originalAdapters;
});

describe("apiClient 401 handling", () => {
  // The visible symptom this pins: a signed-out visitor who mistypes the code from
  // their sign-in email was told "Refresh token missing." - the failure of a token
  // refresh nobody asked for - instead of the API's own "that code is invalid".
  it("hands a refused sign-in credential back with the API's own message", async () => {
    const refresh = rejectWith(401, { detail: "Refresh token missing." });
    axios.defaults.adapter = refresh;
    apiClient.defaults.adapter = rejectWith(401, {
      detail: "This code is invalid or has expired.",
    });

    await expect(
      apiClient.post("/auth/email/verify-code", { request_id: "r", code: "0" }),
    ).rejects.toMatchObject({
      response: { data: { detail: "This code is invalid or has expired." } },
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  // A rejected passkey is the same shape of failure: the credential in the body was
  // refused, and a signed-out visitor has no refresh cookie to fall back on - so
  // "Refresh token missing." would land where the API said the assertion was bad.
  it("does the same for a refused passkey assertion", async () => {
    const refresh = rejectWith(401, { detail: "Refresh token missing." });
    axios.defaults.adapter = refresh;
    apiClient.defaults.adapter = rejectWith(401, {
      detail: "That passkey could not be verified.",
    });

    await expect(
      apiClient.post("/auth/passkey/verify", {
        flow_id: "f",
        credential: {},
      }),
    ).rejects.toMatchObject({
      response: { data: { detail: "That passkey could not be verified." } },
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  // The other half: an ordinary request that 401s because the access token aged out
  // still gets one refresh-and-retry. Without this the set above could quietly grow
  // until nothing refreshes at all.
  it("still refreshes when an ordinary request 401s", async () => {
    const refresh = rejectWith(401, { detail: "Refresh token missing." });
    axios.defaults.adapter = refresh;
    apiClient.defaults.adapter = rejectWith(401, {
      detail: "Not authenticated",
    });

    await expect(apiClient.post("/dives", {})).rejects.toBeDefined();
    expect(refresh).toHaveBeenCalled();
  });
});
