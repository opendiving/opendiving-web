import { describe, expect, it } from "vitest";
import {
  formatPlaceContext,
  geocodeResultToLocation,
  unrepeated,
} from "./locations";
import type { GeocodeResult } from "@/lib/api/geocoding";

describe("formatPlaceContext", () => {
  it("puts the region before the country", () => {
    expect(formatPlaceContext("Cebu", "Philippines")).toBe("Cebu, Philippines");
  });

  it("says whichever one it has where it has only one", () => {
    expect(formatPlaceContext(null, "Philippines")).toBe("Philippines");
    expect(formatPlaceContext("Cebu", undefined)).toBe("Cebu");
  });

  it("answers null for neither, blanks included", () => {
    // Null rather than "" so a caller can tell "nowhere was named" from a name.
    expect(formatPlaceContext(null, null)).toBeNull();
    expect(formatPlaceContext(" ", "")).toBeNull();
  });
});

describe("unrepeated", () => {
  it("keeps a part the labels do not hold", () => {
    expect(unrepeated("Surat Thani Province", "Ko Tao")).toBe(
      "Surat Thani Province",
    );
  });

  it("drops a part equal to a part of a label, whatever its case", () => {
    expect(unrepeated("Philippines", "Philippines")).toBeNull();
    expect(unrepeated("thailand", "Ko Tao, Thailand")).toBeNull();
    expect(unrepeated("Cebu", "Moalboal", " cebu ")).toBeNull();
  });

  it("compares whole parts, never substrings", () => {
    // "Cebu" is context for a place called Cebu City, not a repeat of it.
    expect(unrepeated("Cebu", "Cebu City, Philippines")).toBe("Cebu");
  });

  it("has nothing to say for a blank or missing part", () => {
    expect(unrepeated(null, "Ko Tao")).toBeNull();
    expect(unrepeated(undefined, "Ko Tao")).toBeNull();
    expect(unrepeated("  ", "Ko Tao")).toBeNull();
  });

  it("ignores a missing label", () => {
    expect(unrepeated("Cebu", null, undefined)).toBe("Cebu");
  });
});

describe("geocodeResultToLocation", () => {
  const DAHAB: GeocodeResult = {
    latitude: 28.4949,
    longitude: 34.5136,
    location: "Dahab, Egypt",
    display_name: "Dahab, South Sinai Governorate, Egypt",
    name: "Dahab",
    attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
    bbox_south: 28.45,
    bbox_north: 28.54,
    bbox_west: 34.47,
    bbox_east: 34.55,
  };

  it("names the place the way a person writes it", () => {
    // The API's composed place-plus-country, which is what every surface
    // renders - never the fuller label, which nothing does.
    expect(geocodeResultToLocation(DAHAB).name).toBe("Dahab, Egypt");
  });

  it("keeps the whole label as the fuller form", () => {
    // Stored so an export carries what the source held. It is not derivable
    // from the short form, which is the whole reason it is kept at all.
    expect(geocodeResultToLocation(DAHAB).full_name).toBe(
      "Dahab, South Sinai Governorate, Egypt",
    );
  });

  it("ignores the result's own bare name, which is not what a log records", () => {
    // "Dahab" alone says nothing about which Dahab. It still has a job in the
    // menu, where it is the row's title - but not in the field.
    expect(geocodeResultToLocation({ ...DAHAB, name: "Dahab" }).name).toBe(
      "Dahab, Egypt",
    );
    // And an address-only result has no name at all, which used to be why the
    // mapping needed a fallback.
    expect(geocodeResultToLocation({ ...DAHAB, name: null }).name).toBe(
      "Dahab, Egypt",
    );
  });

  it("takes the centre and the extent a forward search answered with", () => {
    // These are the *place's*, which is what a search by name returns. A
    // reverse geocode does not come through here, because its coordinates are
    // the host's own pin.
    expect(geocodeResultToLocation(DAHAB)).toEqual({
      name: "Dahab, Egypt",
      full_name: "Dahab, South Sinai Governorate, Egypt",
      latitude: 28.4949,
      longitude: 34.5136,
      bbox_south: 28.45,
      bbox_north: 28.54,
      bbox_west: 34.47,
      bbox_east: 34.55,
    });
  });

  it("leaves the box out whole when the provider gave none", () => {
    // The API sends all four or nothing, and a half box is refused on the way
    // back in - so an absent one must stay absent rather than become a corner.
    expect(
      geocodeResultToLocation({
        ...DAHAB,
        bbox_south: null,
        bbox_north: null,
        bbox_west: null,
        bbox_east: null,
      }),
    ).toMatchObject({
      bbox_south: null,
      bbox_north: null,
      bbox_west: null,
      bbox_east: null,
    });
  });
});
