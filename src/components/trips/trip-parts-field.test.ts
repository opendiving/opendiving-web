import { describe, it, expect } from "vitest";
import { GeocodeResult } from "@/lib/api/geocoding";
import { geocodeResultToLocation } from "@/lib/locations";
import {
  describeTripPart,
  locationKey,
  mapSearchResults,
  tripPartErrors,
} from "./trip-parts-field";

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
  it("identifies a picked place by position and fuller name", () => {
    // Places are value objects with no id of their own, so a menu row's id has
    // to come from the content.
    expect(locationKey(geocodeResultToLocation(MOALBOAL))).toBe(
      "geo:9.9366:123.3986:Moalboal, Cebu, Central Visayas, Philippines",
    );
  });

  it("separates two places of the same name", () => {
    // Both compose to "Moalboal, Philippines" now the short form is what a
    // place is called, so the position and the provider's own fuller label are
    // what separate them.
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
    // Nothing else to key it by, and the same name typed twice into one part is
    // one place.
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

describe("mapSearchResults", () => {
  it("builds menu rows that resolve back to what they set", () => {
    const { items, locations } = mapSearchResults([MOALBOAL, BOHOL]);

    // No hint: a place's name carries its country now, so the row says what a
    // second line would have said, and the only string left to put there is the
    // provider's own chain - which nothing in this app renders.
    expect(items).toEqual([
      {
        id: locationKey(geocodeResultToLocation(MOALBOAL)),
        name: "Moalboal, Philippines",
      },
      {
        id: locationKey(geocodeResultToLocation(BOHOL)),
        name: "Bohol, Philippines",
      },
    ]);
    expect(locations.get(items[1].id)).toEqual(geocodeResultToLocation(BOHOL));
  });

  it("keeps the provider's ranking", () => {
    const { items } = mapSearchResults([BOHOL, MOALBOAL]);

    expect(items.map((item) => item.name)).toEqual([
      "Bohol, Philippines",
      "Moalboal, Philippines",
    ]);
  });

  it("collapses results that key identically", () => {
    // Nominatim occasionally returns the same place twice. Two rows sharing an
    // id is a React key warning and an id that resolves back to whichever of
    // them was written last.
    const { items } = mapSearchResults([MOALBOAL, { ...MOALBOAL }]);

    expect(items).toHaveLength(1);
  });

  it("deduplicates the licence notice the results share", () => {
    // Every result of one search carries the same credit; rendering it once per
    // result would be a paragraph of the same sentence.
    const { attributions } = mapSearchResults([
      MOALBOAL,
      BOHOL,
      {
        ...MOALBOAL,
        latitude: 9.9,
        location: "Panagsama, Philippines",
        display_name: "Panagsama Beach, Cebu, Philippines",
        attribution: "Natural Earth",
      },
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

describe("describeTripPart", () => {
  // A part has no name of its own, so the drag handle, the Remove button and
  // the date fields all ask this - and a row whose three controls disagreed
  // about which stretch they belonged to would look right on screen.
  it("names a part by its place", () => {
    expect(
      describeTripPart(
        { location: { name: "Dahab" }, start_date: "2026-04-18" },
        0,
      ),
    ).toBe("Dahab");
  });

  it("names a part with no place by its dates", () => {
    expect(
      describeTripPart({ start_date: "2026-04-18", end_date: "2026-04-22" }, 1),
    ).toBe("Apr 18 - Apr 22, 2026");
  });

  it("names a part with one date by that date", () => {
    expect(describeTripPart({ end_date: "2026-04-22" }, 1)).toBe(
      "Apr 22, 2026",
    );
  });

  it("falls back to the ordinal when a part has neither", () => {
    // Which is what a part looks like the moment it is added.
    expect(describeTripPart({ location: null }, 2)).toBe("part 3");
    expect(describeTripPart({ start_date: "", end_date: "" }, 0)).toBe(
      "part 1",
    );
  });

  it("does not take a blank place name for a name", () => {
    expect(describeTripPart({ location: { name: "  " } }, 0)).toBe("part 1");
  });
});

describe("tripPartErrors", () => {
  // React Hook Form reports a failing part at `parts.N.end_date`, which makes
  // `errors.parts` an array whose own `message` is undefined - so the single
  // `FormMessage` this field would otherwise get renders the word "undefined"
  // and names no row. These are what the rows render instead.
  it("puts a part's message on that part's position", () => {
    expect(
      tripPartErrors([
        undefined,
        { end_date: { message: "End date must be on or after start date" } },
      ]),
    ).toEqual({
      parts: [undefined, "End date must be on or after start date"],
    });
  });

  it("finds a message however deep the schema put it", () => {
    // Both dates and the place sit on one row, so whichever of them was
    // objected to, the row is what has to say so - and a message nobody
    // renders is a save that refuses in silence.
    expect(
      tripPartErrors([
        { location: { name: { message: "Location name is required" } } },
      ]).parts,
    ).toEqual(["Location name is required"]);
  });

  it("reads a message about the list as a message about the list", () => {
    expect(
      tripPartErrors({ message: "A trip cannot have more than 20 parts" }),
    ).toEqual({ list: "A trip cannot have more than 20 parts" });
  });

  it("has nothing to say when nothing is wrong", () => {
    expect(tripPartErrors(undefined)).toEqual({});
    expect(tripPartErrors({})).toEqual({});
  });
});
