import { describe, expect, it } from "vitest";
import { diveCreateSchema, diveMixtureSchema, normalizeMixtures } from "./dive";

const validDive = {
  dive_number: 1,
  start_time: "2024-06-01 09:05:03",
  duration: "45:30",
  dive_site_uuids: [],
  notes: "",
  mixtures: [],
};

describe("diveCreateSchema start_time", () => {
  it("accepts a valid YYYY-MM-DD HH:mm:ss datetime", () => {
    expect(diveCreateSchema.safeParse(validDive).success).toBe(true);
  });

  it("rejects a datetime missing the time component", () => {
    const result = diveCreateSchema.safeParse({
      ...validDive,
      start_time: "2024-06-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty start_time", () => {
    const result = diveCreateSchema.safeParse({ ...validDive, start_time: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a start_time that matches the format but isn't a real date", () => {
    const result = diveCreateSchema.safeParse({
      ...validDive,
      start_time: "2024-13-40 25:99:99",
    });
    expect(result.success).toBe(false);
  });
});

describe("diveCreateSchema duration", () => {
  it("accepts MM:SS with 1-3 digit minutes", () => {
    expect(
      diveCreateSchema.safeParse({ ...validDive, duration: "5:00" }).success,
    ).toBe(true);
    expect(
      diveCreateSchema.safeParse({ ...validDive, duration: "120:00" }).success,
    ).toBe(true);
  });

  it("rejects seconds >= 60", () => {
    const result = diveCreateSchema.safeParse({
      ...validDive,
      duration: "10:60",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a duration without a colon", () => {
    const result = diveCreateSchema.safeParse({
      ...validDive,
      duration: "1030",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty duration", () => {
    const result = diveCreateSchema.safeParse({ ...validDive, duration: "" });
    expect(result.success).toBe(false);
  });
});

describe("diveCreateSchema numeric fields", () => {
  it("rejects a non-positive dive_number", () => {
    const result = diveCreateSchema.safeParse({ ...validDive, dive_number: 0 });
    expect(result.success).toBe(false);
  });

  it("allows max_depth/avg_depth/bottom_temperature/visibility to be omitted", () => {
    expect(diveCreateSchema.safeParse(validDive).success).toBe(true);
  });

  it("rejects a non-positive max_depth when provided", () => {
    const result = diveCreateSchema.safeParse({ ...validDive, max_depth: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer visibility", () => {
    const result = diveCreateSchema.safeParse({
      ...validDive,
      visibility: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("allows bottom_temperature to be negative (below freezing sites exist)", () => {
    const result = diveCreateSchema.safeParse({
      ...validDive,
      bottom_temperature: -1,
    });
    expect(result.success).toBe(true);
  });
});

describe("diveMixtureSchema", () => {
  const validMixture = {
    volume: 12,
    oxygen: 21,
    helium: 0,
  };

  it("accepts a minimal valid mixture", () => {
    expect(diveMixtureSchema.safeParse(validMixture).success).toBe(true);
  });

  it("accepts '' as a placeholder for start_pressure/end_pressure", () => {
    const result = diveMixtureSchema.safeParse({
      ...validMixture,
      start_pressure: "",
      end_pressure: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects oxygen percentage above 100", () => {
    const result = diveMixtureSchema.safeParse({
      ...validMixture,
      oxygen: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative helium percentage", () => {
    const result = diveMixtureSchema.safeParse({ ...validMixture, helium: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive volume", () => {
    const result = diveMixtureSchema.safeParse({ ...validMixture, volume: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects end_pressure greater than start_pressure", () => {
    const result = diveMixtureSchema.safeParse({
      ...validMixture,
      start_pressure: 50,
      end_pressure: 200,
    });
    expect(result.success).toBe(false);
  });

  it("accepts end_pressure equal to start_pressure", () => {
    const result = diveMixtureSchema.safeParse({
      ...validMixture,
      start_pressure: 200,
      end_pressure: 200,
    });
    expect(result.success).toBe(true);
  });

  it("accepts end_pressure less than start_pressure", () => {
    const result = diveMixtureSchema.safeParse({
      ...validMixture,
      start_pressure: 200,
      end_pressure: 50,
    });
    expect(result.success).toBe(true);
  });

  it("accepts end_pressure greater than start_pressure when start_pressure is missing", () => {
    const result = diveMixtureSchema.safeParse({
      ...validMixture,
      end_pressure: 200,
    });
    expect(result.success).toBe(true);
  });
});

describe("normalizeMixtures", () => {
  it("converts '' placeholders to undefined", () => {
    const result = normalizeMixtures([
      {
        id: 5,
        name: "Air",
        volume: 12,
        start_pressure: "",
        end_pressure: "",
        oxygen: 21,
        helium: 0,
      },
    ]);
    expect(result).toEqual([
      {
        name: "Air",
        volume: 12,
        start_pressure: undefined,
        end_pressure: undefined,
        oxygen: 21,
        helium: 0,
      },
    ]);
  });

  it("preserves numeric pressures untouched", () => {
    const result = normalizeMixtures([
      {
        volume: 12,
        start_pressure: 200,
        end_pressure: 50,
        oxygen: 32,
        helium: 0,
      },
    ]);
    expect(result[0].start_pressure).toBe(200);
    expect(result[0].end_pressure).toBe(50);
  });

  it("strips the client-side id field", () => {
    const result = normalizeMixtures([
      {
        id: 5,
        volume: 12,
        oxygen: 21,
        helium: 0,
      },
    ]);
    expect(result[0]).not.toHaveProperty("id");
  });

  it("handles multiple mixtures independently", () => {
    const result = normalizeMixtures([
      {
        volume: 12,
        start_pressure: 200,
        end_pressure: "",
        oxygen: 21,
        helium: 0,
      },
      {
        volume: 10,
        start_pressure: "",
        end_pressure: 20,
        oxygen: 32,
        helium: 0,
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].end_pressure).toBeUndefined();
    expect(result[1].start_pressure).toBeUndefined();
  });
});
