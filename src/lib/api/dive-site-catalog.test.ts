import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  diveSiteCatalogAPI,
  diveSitePlaceContext,
  DiveSiteSuggestion,
  MAX_SITE_QUERY_LENGTH,
  MIN_SITE_QUERY_LENGTH,
} from "./dive-site-catalog";

vi.mock("./client", () => ({
  apiClient: { get: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);

const THISTLEGORM: DiveSiteSuggestion = {
  name: "SS Thistlegorm",
  name_en: null,
  latitude: 27.814092,
  longitude: 33.920048,
  country: "Egypt",
  region: "South Sinai",
  source: "osm",
  source_id: "node/255316037",
  attribution:
    "[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)",
};

const answer = (results: DiveSiteSuggestion[], has_more = false) =>
  get.mockResolvedValue({ status: 200, data: { results, has_more } });

beforeEach(() => {
  get.mockReset();
});

describe("diveSiteCatalogAPI.suggestDiveSites", () => {
  it("asks with the trimmed query alone when the form has no position", async () => {
    answer([THISTLEGORM]);

    const response = await diveSiteCatalogAPI.suggestDiveSites(" thistle ");

    expect(get).toHaveBeenCalledWith("/dive-sites/suggest", {
      params: { q: "thistle" },
    });
    expect(response.results).toEqual([THISTLEGORM]);
  });

  it("sends both coordinates when it has a position", async () => {
    // Which is what makes the answer come back nearest first - the only thing
    // that separates a same-name cluster.
    answer([THISTLEGORM]);

    await diveSiteCatalogAPI.suggestDiveSites("shark point", {
      latitude: 6.3,
      longitude: 99.7,
    });

    expect(get).toHaveBeenCalledWith("/dive-sites/suggest", {
      params: { q: "shark point", latitude: 6.3, longitude: 99.7 },
    });
  });

  it("treats a null position as none, rather than as half a pair", async () => {
    // The caller parses this out of two text inputs and gets `null` whenever
    // either one is unusable. The endpoint answers 422 to one coordinate
    // without the other, so it must not be possible to send one.
    answer([]);

    await diveSiteCatalogAPI.suggestDiveSites("blue hole", null);

    expect(get).toHaveBeenCalledWith("/dive-sites/suggest", {
      params: { q: "blue hole" },
    });
  });

  it("passes the cap through so the menu can say the list was cut", async () => {
    answer([THISTLEGORM], true);

    expect((await diveSiteCatalogAPI.suggestDiveSites("blue")).has_more).toBe(
      true,
    );
  });

  // The guard the combobox makes necessary: it probes with "" the moment its
  // menu opens, and the endpoint answers a 422 to that - which is a rejection,
  // the one failure a picker cannot render as "no match". Without these the
  // dialog would show its search error before a diver typed a character.
  it("answers an empty query without asking", async () => {
    const response = await diveSiteCatalogAPI.suggestDiveSites("");

    expect(get).not.toHaveBeenCalled();
    expect(response).toEqual({ results: [], has_more: false });
  });

  it("answers a query below the minimum without asking", async () => {
    await diveSiteCatalogAPI.suggestDiveSites(
      "a".repeat(MIN_SITE_QUERY_LENGTH - 1),
    );

    expect(get).not.toHaveBeenCalled();
  });

  it("answers a query past the maximum without asking", async () => {
    await diveSiteCatalogAPI.suggestDiveSites(
      "a".repeat(MAX_SITE_QUERY_LENGTH + 1),
    );

    expect(get).not.toHaveBeenCalled();
  });

  it("measures the trimmed length, not the typed one", async () => {
    // A pasted "  a  " is one character of query with four of whitespace, and
    // asking about it would be the same 422.
    await diveSiteCatalogAPI.suggestDiveSites("  a  ");

    expect(get).not.toHaveBeenCalled();
  });
});

describe("diveSitePlaceContext", () => {
  it("puts the region before the country, as the Location field reads", () => {
    expect(diveSitePlaceContext(THISTLEGORM)).toBe("South Sinai, Egypt");
  });

  it("falls back to the country where the record has no region", () => {
    // Admin-1 coverage is uneven by country, so this is an ordinary row rather
    // than a corner.
    expect(diveSitePlaceContext({ ...THISTLEGORM, region: null })).toBe(
      "Egypt",
    );
  });

  it("answers null where the record resolved to neither", () => {
    // A site far enough offshore belongs to no administrative area at all, and
    // ships anyway. Null rather than "" because the caller must be able to tell
    // "nowhere was named" from "the name is empty" - only the second would be
    // grounds to clear a field the diver typed into.
    expect(
      diveSitePlaceContext({ ...THISTLEGORM, region: null, country: null }),
    ).toBeNull();
  });

  it("ignores a place that is only whitespace", () => {
    expect(
      diveSitePlaceContext({ ...THISTLEGORM, region: " ", country: " " }),
    ).toBeNull();
  });
});
