import { describe, expect, it } from "vitest";
import { formatLocationContext, geocodeResultToLocation } from "./locations";
import type { GeocodeResult } from "@/lib/api/geocoding";

describe("formatLocationContext", () => {
  it("drops the name the label repeats at the front", () => {
    // The whole point: the row shows the name and then this, and Nominatim's
    // label opens with the name it was matched by.
    expect(
      formatLocationContext({
        name: "Dahab",
        full_name: "Dahab, South Sinai, 45214, Egypt",
      }),
    ).toBe("South Sinai, 45214, Egypt");
    expect(
      formatLocationContext({
        name: "Ko Tao",
        full_name:
          "Ko Tao, Ko Pha-ngan District, Surat Thani Province, Thailand",
      }),
    ).toBe("Ko Pha-ngan District, Surat Thani Province, Thailand");
  });

  it("keeps a repeat that is not at the front", () => {
    // "Dahab" is context for a site called Blue Hole, not a duplicate of it -
    // and it is the context that tells two Blue Holes apart.
    expect(
      formatLocationContext({
        name: "Blue Hole",
        full_name: "Blue Hole, Dahab, South Sinai, Egypt",
      }),
    ).toBe("Dahab, South Sinai, Egypt");
  });

  it("keeps a part the name only prefixes", () => {
    // Matching on the whole part, not on the characters: "Ko Tao" must not eat
    // the front of "Ko Tao Island".
    expect(
      formatLocationContext({
        name: "Ko Tao",
        full_name: "Ko Tao Island, Surat Thani Province, Thailand",
      }),
    ).toBe("Ko Tao Island, Surat Thani Province, Thailand");
  });

  it("answers undefined when the label says no more than the name", () => {
    // So the caller drops the element rather than rendering an empty one.
    expect(
      formatLocationContext({ name: "Bohol", full_name: "Bohol" }),
    ).toBeUndefined();
    expect(
      formatLocationContext({ name: "Bohol", full_name: " bohol " }),
    ).toBeUndefined();
  });

  it("has nothing to say about a place with no label", () => {
    // Nothing to trim and nothing left over, so the caller drops the hint.
    expect(formatLocationContext({ name: "The Boat" })).toBeUndefined();
    expect(
      formatLocationContext({ name: "The Boat", full_name: null }),
    ).toBeUndefined();
    expect(
      formatLocationContext({ name: "The Boat", full_name: "  " }),
    ).toBeUndefined();
  });

  it("gives the whole label to a place with no name to trim off it", () => {
    expect(
      formatLocationContext({ full_name: "Dahab, South Sinai, Egypt" }),
    ).toBe("Dahab, South Sinai, Egypt");
    expect(
      formatLocationContext({
        name: " ",
        full_name: "Dahab, South Sinai, Egypt",
      }),
    ).toBe("Dahab, South Sinai, Egypt");
  });

  it("trims each part of the label it keeps", () => {
    // The label is the provider's, and its spacing is not this app's to
    // reproduce faithfully.
    expect(
      formatLocationContext({
        name: "Dahab",
        full_name: "Dahab,South Sinai ,  Egypt",
      }),
    ).toBe("South Sinai, Egypt");
  });

  it("trims a multi-part name the label opens with", () => {
    // An address-only result has no name of its own and falls back to the
    // composed "Dahab, Egypt", which the label can repeat whole.
    expect(
      formatLocationContext({
        name: "Dahab, Egypt",
        full_name: "Dahab, Egypt, South Sinai",
      }),
    ).toBe("South Sinai");
  });
});

describe("geocodeResultToLocation", () => {
  const DAHAB: GeocodeResult = {
    latitude: 28.4949,
    longitude: 34.5136,
    location: "Dahab, Egypt",
    display_name: "Dahab, South Sinai, 45214, Egypt",
    name: "Dahab",
    attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
    bbox_south: 28.45,
    bbox_north: 28.54,
    bbox_west: 34.47,
    bbox_east: 34.55,
  };

  it("names the place the way a person writes it, not the way a provider does", () => {
    // The API's composed place-plus-country, which is what every surface
    // renders - never the provider's postal chain, which nothing does.
    expect(geocodeResultToLocation(DAHAB).name).toBe("Dahab, Egypt");
  });

  it("keeps the provider's whole label as the fuller form", () => {
    // Stored so an export carries what the source held. It is not derivable
    // from the short form, which is the whole reason it is kept at all.
    expect(geocodeResultToLocation(DAHAB).full_name).toBe(
      "Dahab, South Sinai, 45214, Egypt",
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
      full_name: "Dahab, South Sinai, 45214, Egypt",
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
