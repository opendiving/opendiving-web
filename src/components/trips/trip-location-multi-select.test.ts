import { describe, it, expect } from "vitest";
import { GeocodeResult } from "@/lib/api/geocoding";
import {
  geocodeResultToLocation,
  locationKey,
  mapSearchResults,
} from "./trip-location-multi-select";

const MOALBOAL: GeocodeResult = {
  latitude: 9.9366,
  longitude: 123.3986,
  location: "Moalboal, Philippines",
  display_name: "Moalboal, Cebu, Central Visayas, Philippines",
  name: "Moalboal",
  attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
};

const BOHOL: GeocodeResult = {
  latitude: 9.85,
  longitude: 124.14,
  location: "Bohol, Philippines",
  display_name: "Bohol, Central Visayas, Philippines",
  name: "Bohol",
  attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
  bbox_south: 9.48,
  bbox_north: 10.29,
  bbox_west: 123.7,
  bbox_east: 124.66,
};

describe("locationKey", () => {
  it("identifies a picked place by position and full label", () => {
    // Locations are value objects with no id of their own, so identity has to
    // come from the content - and the label is what separates two places that
    // share a name.
    expect(locationKey(geocodeResultToLocation(MOALBOAL))).toBe(
      "geo:9.9366:123.3986:Moalboal, Cebu, Central Visayas, Philippines",
    );
  });

  it("separates two places of the same name", () => {
    const negros = geocodeResultToLocation({
      ...MOALBOAL,
      latitude: 9.33,
      longitude: 122.86,
      display_name: "Moalboal, Negros Oriental, Philippines",
    });

    expect(locationKey(geocodeResultToLocation(MOALBOAL))).not.toBe(
      locationKey(negros),
    );
  });

  it("keys a typed-in place by its name alone", () => {
    // Nothing else to key it by, and the same name typed twice is one place -
    // otherwise blur re-committing the text would stack duplicate rows.
    expect(locationKey({ name: "  The Boat  " })).toBe("txt:the boat");
    expect(locationKey({ name: "the boat" })).toBe("txt:the boat");
  });

  it("treats a half position as no position", () => {
    // Not a shape the API accepts, but the key must not read as a place on the
    // map when only one coordinate survived.
    expect(locationKey({ name: "Somewhere", latitude: 9.9 })).toBe(
      "txt:somewhere",
    );
    expect(
      locationKey({ name: "Somewhere", longitude: 123.4, latitude: null }),
    ).toBe("txt:somewhere");
  });
});

describe("geocodeResultToLocation", () => {
  it("carries the place's position and extent through", () => {
    // The bbox is what lets the confirmation map frame an island rather than
    // put one pin in the middle of it.
    expect(geocodeResultToLocation(BOHOL)).toEqual({
      name: "Bohol",
      display_name: "Bohol, Central Visayas, Philippines",
      latitude: 9.85,
      longitude: 124.14,
      bbox_south: 9.48,
      bbox_north: 10.29,
      bbox_west: 123.7,
      bbox_east: 124.66,
    });
  });

  it("falls back to the composed location when the result has no name", () => {
    // An address-only match ("12 Corniche Road") has no name of its own, and a
    // row has to say something.
    const address = { ...MOALBOAL, name: null };

    expect(geocodeResultToLocation(address).name).toBe("Moalboal, Philippines");
  });
});

describe("mapSearchResults", () => {
  it("builds menu rows that resolve back to what they append", () => {
    const { items, locations } = mapSearchResults([MOALBOAL, BOHOL]);

    expect(items).toEqual([
      {
        id: locationKey(geocodeResultToLocation(MOALBOAL)),
        name: "Moalboal",
        hint: "Moalboal, Cebu, Central Visayas, Philippines",
      },
      {
        id: locationKey(geocodeResultToLocation(BOHOL)),
        name: "Bohol",
        hint: "Bohol, Central Visayas, Philippines",
      },
    ]);
    expect(locations.get(items[1].id)).toEqual(geocodeResultToLocation(BOHOL));
  });

  it("keeps the provider's ranking", () => {
    const { items } = mapSearchResults([BOHOL, MOALBOAL]);

    expect(items.map((item) => item.name)).toEqual(["Bohol", "Moalboal"]);
  });

  it("collapses results that key identically", () => {
    // Nominatim occasionally returns the same place twice. Two rows sharing an
    // id is a React key warning and a row that can't be excluded once picked.
    const { items } = mapSearchResults([MOALBOAL, { ...MOALBOAL }]);

    expect(items).toHaveLength(1);
  });

  it("deduplicates the licence notice the results share", () => {
    // Every result of one search carries the same credit; rendering it once per
    // result would be a paragraph of the same sentence.
    const { attributions } = mapSearchResults([
      MOALBOAL,
      BOHOL,
      { ...MOALBOAL, name: "Panagsama", attribution: "Natural Earth" },
    ]);

    expect(attributions).toEqual([
      "Data © OpenStreetMap contributors, ODbL 1.0.",
      "Natural Earth",
    ]);
  });

  it("has nothing to show for a search that matched nothing", () => {
    const { items, locations, attributions } = mapSearchResults([]);

    expect(items).toEqual([]);
    expect(locations.size).toBe(0);
    expect(attributions).toEqual([]);
  });
});
