import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  geocodingAPI,
  GeocodeResult,
  MAX_PLACE_QUERY_LENGTH,
  MIN_PLACE_QUERY_LENGTH,
} from "./geocoding";

vi.mock("./client", () => ({
  apiClient: { get: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);

const RESULT: GeocodeResult = {
  latitude: 28.5011,
  longitude: 34.5136,
  location: "Dahab, Egypt",
  display_name: "Blue Hole, Dahab, South Sinai, Egypt",
  name: "Blue Hole",
  attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
};

beforeEach(() => {
  get.mockReset();
});

// What these pin is the three-way split the API spends a second status code on:
// "here is a name", "there is no name here", and "we never got to ask". The last
// two are what decide whether it is safe to empty a field a diver typed into, and
// they used to be the same value over the wire.
describe("geocodingAPI.reverseGeocode", () => {
  it("passes the position as query parameters", async () => {
    get.mockResolvedValue({ status: 200, data: RESULT });

    await geocodingAPI.reverseGeocode(28.5717, 34.5372);

    expect(get).toHaveBeenCalledWith("/geocode/reverse", {
      params: { lat: 28.5717, lon: 34.5372 },
    });
  });

  it("reads a 200 with a result as a name for the position", async () => {
    get.mockResolvedValue({ status: 200, data: RESULT });

    await expect(
      geocodingAPI.reverseGeocode(28.5717, 34.5372),
    ).resolves.toEqual({ status: "named", result: RESULT });
  });

  it("reads a 204 as the position having no name", async () => {
    // Note the body: axios represents "no content" as `""`, not `null` and not
    // `undefined`, so the obvious `data ?? null` would fold this case into
    // "could not ask" and the whole distinction would be lost on this line.
    get.mockResolvedValue({ status: 204, data: "" });

    await expect(geocodingAPI.reverseGeocode(-70.1, 12.2)).resolves.toEqual({
      status: "nameless",
    });
  });

  it("reads a 200 with null as never having got to ask", async () => {
    // Geocoding switched off, the instance over its provider cap - one request a
    // second, counted across every user - or the provider unreachable. Nothing
    // was learned about the position, so nothing may be cleared because of it.
    get.mockResolvedValue({ status: 200, data: null });

    await expect(
      geocodingAPI.reverseGeocode(28.5717, 34.5372),
    ).resolves.toEqual({ status: "unknown" });
  });

  it("reads a result with no location the same cautious way", async () => {
    // Not a shape the API produces, but the field is what gets written and the
    // safe direction to be wrong in is "leave it alone".
    get.mockResolvedValue({ status: 200, data: { ...RESULT, location: "" } });

    await expect(
      geocodingAPI.reverseGeocode(28.5717, 34.5372),
    ).resolves.toEqual({ status: "unknown" });
  });

  it("lets a failure through rather than inventing an outcome", async () => {
    // An API older than this endpoint 404s, and the per-user rate limit 429s.
    // Both are for the caller to treat as "nothing was learned"; neither is
    // something this function may quietly turn into a nameless position.
    get.mockRejectedValue(new Error("404"));

    await expect(geocodingAPI.reverseGeocode(28.5717, 34.5372)).rejects.toThrow(
      "404",
    );
  });
});

describe("geocodingAPI.searchPlaces", () => {
  it("passes the trimmed query", async () => {
    get.mockResolvedValue({ status: 200, data: [RESULT] });

    await expect(geocodingAPI.searchPlaces("  moalboal  ")).resolves.toEqual([
      RESULT,
    ]);
    expect(get).toHaveBeenCalledWith("/geocode/search", {
      params: { q: "moalboal" },
    });
  });

  it("answers a too-short query without asking the API", async () => {
    // `q` is `min_length=2` on the endpoint, and a combobox probes with "" the
    // moment its menu opens - so without this every menu-open would be a 422.
    await expect(geocodingAPI.searchPlaces("")).resolves.toEqual([]);
    await expect(geocodingAPI.searchPlaces("m")).resolves.toEqual([]);
    await expect(geocodingAPI.searchPlaces(" m ")).resolves.toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it("answers an over-long query without asking the API", async () => {
    // The other end of the endpoint's `2..200`. A pasted paragraph would 422,
    // and a 422 arrives as a rejection - the one answer the picker cannot fall
    // back from, where an empty list still leaves Enter-to-add-as-text working.
    await expect(geocodingAPI.searchPlaces("m".repeat(201))).resolves.toEqual(
      [],
    );
    expect(get).not.toHaveBeenCalled();

    get.mockResolvedValue({ status: 200, data: [] });
    await expect(geocodingAPI.searchPlaces("m".repeat(200))).resolves.toEqual(
      [],
    );
    expect(get).toHaveBeenCalledOnce();
  });

  it("publishes both bounds, since a field has to say which side it is on", async () => {
    // The picker hands these to the combobox, which is what keeps an unsent
    // query from being reported as a search that found nothing.
    expect(MIN_PLACE_QUERY_LENGTH).toBe(2);
    expect(MAX_PLACE_QUERY_LENGTH).toBe(200);
  });

  it("carries the place's extent through", async () => {
    // The bounding box is what lets a confirmation map frame a country rather
    // than put one pin in the middle of it.
    const boxed: GeocodeResult = {
      ...RESULT,
      bbox_south: 4.2,
      bbox_north: 21.3,
      bbox_west: 116.4,
      bbox_east: 126.6,
    };
    get.mockResolvedValue({ status: 200, data: [boxed] });

    await expect(geocodingAPI.searchPlaces("philippines")).resolves.toEqual([
      boxed,
    ]);
  });

  it("passes an empty result set through as-is", async () => {
    // "Nothing matched" and "the provider is throttled" are the same answer
    // here by design; the picker's escape hatch is the same either way.
    get.mockResolvedValue({ status: 200, data: [] });

    await expect(geocodingAPI.searchPlaces("qqqqqq")).resolves.toEqual([]);
  });

  it("lets a failure through", async () => {
    // The per-user 429. Thrown rather than flattened to `[]`, so the picker can
    // still tell "we couldn't ask" from "nothing matched" - it empties the menu
    // either way, and what differs is the sentence it puts there.
    get.mockRejectedValue(new Error("429"));

    await expect(geocodingAPI.searchPlaces("moalboal")).rejects.toThrow("429");
  });
});
