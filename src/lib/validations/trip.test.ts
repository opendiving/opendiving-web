import { describe, expect, it } from "vitest";
import { MAX_TRIP_PARTS, normalizeTripParts, tripFormSchema } from "./trip";

describe("tripFormSchema", () => {
  const validTrip = { name: "Red Sea Liveaboard" };

  it("accepts a trip that is only a name", () => {
    // A trip stores no dates of its own, and a trip with no parts is a legal
    // state - the shape a diver leaves behind by naming a trip and filling the
    // rest in later.
    expect(tripFormSchema.safeParse(validTrip).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(tripFormSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("accepts a part with dates and no place", () => {
    // A travel day, or a week nobody geocoded.
    const result = tripFormSchema.safeParse({
      ...validTrip,
      parts: [{ start_date: "2024-06-01", end_date: "2024-06-08" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a part with a place and no dates", () => {
    const result = tripFormSchema.safeParse({
      ...validTrip,
      parts: [{ location: { name: "Dahab" } }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a part with neither", () => {
    // What the Add button produces, and what the diver is looking at while they
    // decide which half they know.
    const result = tripFormSchema.safeParse({
      ...validTrip,
      parts: [{ location: null, start_date: "", end_date: "" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a part whose end is on or after its start", () => {
    for (const end_date of ["2024-06-08", "2024-06-01"]) {
      const result = tripFormSchema.safeParse({
        ...validTrip,
        parts: [{ start_date: "2024-06-01", end_date }],
      });
      expect(result.success).toBe(true);
    }
  });

  it("reports a reversed range on the part that has it", () => {
    // The issue path is what puts `FormMessage` under the row that is wrong
    // rather than under the first one.
    const result = tripFormSchema.safeParse({
      ...validTrip,
      parts: [
        { start_date: "2024-06-01", end_date: "2024-06-08" },
        { start_date: "2024-06-08", end_date: "2024-06-02" },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["parts", 1, "end_date"]);
    }
  });

  it("lets two parts name the same place", () => {
    // Dahab, then Sharm, then back to Dahab. The old model wanted the places of
    // a trip to be distinct; a stretch of time is a thing a trip can return to.
    const result = tripFormSchema.safeParse({
      ...validTrip,
      parts: [
        { location: { name: "Dahab" }, start_date: "2024-06-01" },
        { location: { name: "Sharm" }, start_date: "2024-06-03" },
        { location: { name: "Dahab" }, start_date: "2024-06-05" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a geocoded place whole", () => {
    const result = tripFormSchema.safeParse({
      ...validTrip,
      parts: [
        {
          location: {
            name: "Moalboal, Philippines",
            full_name: "Moalboal, Cebu, Central Visayas, Philippines",
            latitude: 9.9366,
            longitude: 123.396,
            bbox_south: 9.87,
            bbox_north: 10.0,
            bbox_west: 123.3,
            bbox_east: 123.45,
          },
        },
      ],
    });
    expect(result.success).toBe(true);
    // Named, because an unknown member is stripped rather than refused: a
    // fixture spelling this wrong would pass while covering nothing.
    expect(result.data?.parts?.[0].location?.full_name).toBe(
      "Moalboal, Cebu, Central Visayas, Philippines",
    );
  });

  it("accepts the nulls the API sends for an unknown position", () => {
    // `trip.parts` is fed straight into the form when editing, and the API
    // writes absent coordinates as `null`, not as a missing key.
    const result = tripFormSchema.safeParse({
      ...validTrip,
      parts: [
        {
          location: {
            name: "Somewhere",
            full_name: null,
            latitude: null,
            longitude: null,
            bbox_south: null,
            bbox_north: null,
            bbox_west: null,
            bbox_east: null,
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a fuller name past the API's ceiling", () => {
    const result = tripFormSchema.safeParse({
      ...validTrip,
      parts: [
        { location: { name: "Dahab, Egypt", full_name: "a".repeat(513) } },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a place with no name", () => {
    const result = tripFormSchema.safeParse({
      ...validTrip,
      parts: [{ location: { name: "" } }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range coordinate", () => {
    const result = tripFormSchema.safeParse({
      ...validTrip,
      parts: [{ location: { name: "Nowhere", latitude: 91, longitude: 0 } }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more parts than the API accepts", () => {
    const result = tripFormSchema.safeParse({
      ...validTrip,
      parts: Array.from({ length: MAX_TRIP_PARTS + 1 }, (_, index) => ({
        location: { name: `Place ${index}` },
      })),
    });
    expect(result.success).toBe(false);
  });
});

describe("normalizeTripParts", () => {
  it("converts '' placeholders to undefined", () => {
    expect(
      normalizeTripParts([{ start_date: "", end_date: "", location: null }]),
    ).toEqual([{ start_date: undefined, end_date: undefined, location: null }]);
  });

  it("preserves non-empty date strings", () => {
    expect(
      normalizeTripParts([
        { start_date: "2024-06-01", end_date: "2024-06-08" },
      ]),
    ).toEqual([
      { start_date: "2024-06-01", end_date: "2024-06-08", location: null },
    ]);
  });

  it("sends an absent place as null rather than dropping the member", () => {
    // `null` is how the API reads "this stretch has no place"; an omitted key
    // would be indistinguishable from a part that was never edited.
    expect(normalizeTripParts([{}])[0].location).toBeNull();
  });

  it("carries a place through untouched", () => {
    const location = {
      name: "Dahab, Egypt",
      full_name: "Dahab, South Sinai, Egypt",
    };
    expect(normalizeTripParts([{ location }])[0].location).toEqual(location);
  });

  it("answers an absent list with an empty one", () => {
    // The form always sends its parts, so "no parts" has to be expressible.
    expect(normalizeTripParts(undefined)).toEqual([]);
  });
});
