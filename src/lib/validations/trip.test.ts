import { describe, expect, it } from "vitest";
import { normalizeTripDates, tripCreateSchema, tripUpdateSchema } from "./trip";

describe("tripCreateSchema", () => {
  const validTrip = {
    name: "Red Sea Liveaboard",
    start_date: "2024-06-01",
  };

  it("accepts a valid trip with only the required fields", () => {
    expect(tripCreateSchema.safeParse(validTrip).success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = tripCreateSchema.safeParse({ ...validTrip, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing start_date", () => {
    const result = tripCreateSchema.safeParse({ name: "Trip" });
    expect(result.success).toBe(false);
  });

  it("accepts an end_date on or after the start_date", () => {
    const result = tripCreateSchema.safeParse({
      ...validTrip,
      end_date: "2024-06-08",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an end_date equal to the start_date", () => {
    const result = tripCreateSchema.safeParse({
      ...validTrip,
      end_date: "2024-06-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an end_date before the start_date", () => {
    const result = tripCreateSchema.safeParse({
      ...validTrip,
      end_date: "2024-05-31",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["end_date"]);
    }
  });

  it("allows omitting end_date entirely", () => {
    const result = tripCreateSchema.safeParse(validTrip);
    expect(result.success).toBe(true);
  });
});

describe("tripUpdateSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(tripUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("still enforces the date-range refinement when both dates are present", () => {
    const result = tripUpdateSchema.safeParse({
      start_date: "2024-06-08",
      end_date: "2024-06-01",
    });
    expect(result.success).toBe(false);
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

  it("passes through name/location unmodified", () => {
    const result = normalizeTripDates({
      name: "Trip",
      location: "Egypt",
    });
    expect(result.name).toBe("Trip");
    expect(result.location).toBe("Egypt");
  });
});
