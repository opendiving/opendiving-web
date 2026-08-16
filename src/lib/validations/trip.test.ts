import { describe, expect, it } from "vitest";
import { normalizeTripDates, tripFormSchema } from "./trip";

describe("tripFormSchema", () => {
  const validTrip = {
    name: "Red Sea Liveaboard",
    start_date: "2024-06-01",
  };

  it("accepts a valid trip with only the required fields", () => {
    expect(tripFormSchema.safeParse(validTrip).success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = tripFormSchema.safeParse({ ...validTrip, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing start_date", () => {
    const result = tripFormSchema.safeParse({ name: "Trip" });
    expect(result.success).toBe(false);
  });

  it("accepts an end_date on or after the start_date", () => {
    const result = tripFormSchema.safeParse({
      ...validTrip,
      end_date: "2024-06-08",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an end_date equal to the start_date", () => {
    const result = tripFormSchema.safeParse({
      ...validTrip,
      end_date: "2024-06-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an end_date before the start_date", () => {
    const result = tripFormSchema.safeParse({
      ...validTrip,
      end_date: "2024-05-31",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["end_date"]);
    }
  });

  it("allows omitting end_date entirely", () => {
    const result = tripFormSchema.safeParse(validTrip);
    expect(result.success).toBe(true);
  });

  it("accepts a location that is only a name", () => {
    // The free-text escape hatch: a place the geocoder had nothing for is still
    // somewhere the diver went.
    const result = tripFormSchema.safeParse({
      ...validTrip,
      locations: [{ name: "Uncle Bob's house reef" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a geocoded location whole", () => {
    const result = tripFormSchema.safeParse({
      ...validTrip,
      locations: [
        {
          name: "Moalboal",
          display_name: "Moalboal, Cebu, Central Visayas, Philippines",
          latitude: 9.9366,
          longitude: 123.396,
          bbox_south: 9.87,
          bbox_north: 10.0,
          bbox_west: 123.3,
          bbox_east: 123.45,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts the nulls the API sends for an unknown position", () => {
    // `trip.locations` is fed straight into the form when editing, and the API
    // writes absent coordinates as `null`, not as a missing key.
    const result = tripFormSchema.safeParse({
      ...validTrip,
      locations: [
        {
          name: "Somewhere",
          display_name: null,
          latitude: null,
          longitude: null,
          bbox_south: null,
          bbox_north: null,
          bbox_west: null,
          bbox_east: null,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a location with no name", () => {
    const result = tripFormSchema.safeParse({
      ...validTrip,
      locations: [{ name: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range coordinate", () => {
    const result = tripFormSchema.safeParse({
      ...validTrip,
      locations: [{ name: "Nowhere", latitude: 91, longitude: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more locations than the API accepts", () => {
    const result = tripFormSchema.safeParse({
      ...validTrip,
      locations: Array.from({ length: 21 }, (_, index) => ({
        name: `Place ${index}`,
      })),
    });
    expect(result.success).toBe(false);
  });

  it("allows omitting locations entirely", () => {
    expect(tripFormSchema.safeParse(validTrip).success).toBe(true);
  });
});

describe("normalizeTripDates", () => {
  it("converts '' placeholders to undefined", () => {
    const result = normalizeTripDates({
      name: "Trip",
      start_date: "",
      end_date: "",
    });
    expect(result.start_date).toBeUndefined();
    expect(result.end_date).toBeUndefined();
  });

  it("preserves non-empty date strings", () => {
    const result = normalizeTripDates({
      name: "Trip",
      start_date: "2024-06-01",
      end_date: "2024-06-08",
    });
    expect(result.start_date).toBe("2024-06-01");
    expect(result.end_date).toBe("2024-06-08");
  });

  it("passes through name/notes unmodified", () => {
    const result = normalizeTripDates({
      name: "Trip",
      notes: "Great viz",
    });
    expect(result.name).toBe("Trip");
    expect(result.notes).toBe("Great viz");
  });
});
