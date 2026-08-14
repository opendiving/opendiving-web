import { describe, expect, it } from "vitest";
import {
  buildDiveUpdate,
  diveCreateSchema,
  diveMixtureSchema,
  diveUpdateSchema,
  normalizeMixtures,
  toDiveMixtureInput,
} from "./dive";
import type { DiveMixture } from "@/lib/api/dives";

const validDive = {
  dive_number: 1,
  start_time: "2024-06-01T09:05:03+02:00",
  duration: "45:30",
  dive_site_uuids: [],
  notes: "",
  mixtures: [],
};

describe("diveCreateSchema start_time", () => {
  it("accepts a valid offset-aware ISO 8601 datetime", () => {
    expect(diveCreateSchema.safeParse(validDive).success).toBe(true);
  });

  it("accepts a 'Z' suffix as a zero offset", () => {
    const result = diveCreateSchema.safeParse({
      ...validDive,
      start_time: "2024-06-01T09:05:03Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a non-hour-aligned offset (e.g. +05:45)", () => {
    const result = diveCreateSchema.safeParse({
      ...validDive,
      start_time: "2024-06-01T09:05:03+05:45",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a datetime with no UTC offset at all", () => {
    const result = diveCreateSchema.safeParse({
      ...validDive,
      start_time: "2024-06-01 09:05:03",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty start_time", () => {
    const result = diveCreateSchema.safeParse({ ...validDive, start_time: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a start_time that matches the offset format but isn't a real date", () => {
    const result = diveCreateSchema.safeParse({
      ...validDive,
      start_time: "2024-13-40T25:99:99+02:00",
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

  it("rejects a negative weight", () => {
    const result = diveCreateSchema.safeParse({ ...validDive, weight: -1 });
    expect(result.success).toBe(false);
  });

  // Unlike the depths, zero is a meaningful weight (a drysuit with a heavy
  // undergarment, a freedive) and is kept distinct from an omitted one.
  it("allows a weight of zero", () => {
    const result = diveCreateSchema.safeParse({ ...validDive, weight: 0 });
    expect(result.success).toBe(true);
  });

  it("allows a fractional weight", () => {
    const result = diveCreateSchema.safeParse({ ...validDive, weight: 4.5 });
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

  it("rejects oxygen and helium summing past 100", () => {
    // Each fraction is individually legal, so only the sum rule catches this.
    // Before it existed the form accepted this and the API answered with a 500
    // from `ck_dive_mixture_oxygen_helium_sum`.
    const result = diveMixtureSchema.safeParse({
      ...validMixture,
      oxygen: 50,
      helium: 60,
    });
    expect(result.success).toBe(false);
  });

  it("reports the sum rule on the helium field", () => {
    const result = diveMixtureSchema.safeParse({
      ...validMixture,
      oxygen: 50,
      helium: 60,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
        "helium",
      ]);
    }
  });

  it("accepts oxygen and helium summing to exactly 100", () => {
    const result = diveMixtureSchema.safeParse({
      ...validMixture,
      oxygen: 30,
      helium: 70,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a normal trimix", () => {
    const result = diveMixtureSchema.safeParse({
      ...validMixture,
      oxygen: 18,
      helium: 45,
    });
    expect(result.success).toBe(true);
  });

  it("leaves an out-of-range oxygen to the range rule alone", () => {
    // Zod runs the sum refinement alongside the per-field rules, not instead of
    // them. Without a guard this reported "oxygen and helium together..." on the
    // helium field while the He box read 0 - naming a field the diver has no
    // reason to touch.
    const result = diveMixtureSchema.safeParse({
      ...validMixture,
      oxygen: 150,
      helium: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([
        ["oxygen"],
      ]);
    }
  });

  it("leaves an out-of-range helium to the range rule alone", () => {
    const result = diveMixtureSchema.safeParse({
      ...validMixture,
      oxygen: 21,
      helium: -1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([
        ["helium"],
      ]);
    }
  });

  it("still reports the sum rule when both fractions are individually valid", () => {
    const result = diveMixtureSchema.safeParse({
      ...validMixture,
      oxygen: 50,
      helium: 60,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([
        ["helium"],
      ]);
    }
  });
});

describe("toDiveMixtureInput", () => {
  // Written out as the API actually serializes it - explicit `null`s, not absent
  // keys - because that difference is the whole point of the conversion. Every
  // other mixture fixture in this file is already form-shaped, which is how a
  // form that could not be saved at all passed the suite.
  const fromApi: DiveMixture = {
    id: 7,
    volume: 11.1,
    start_pressure: null,
    end_pressure: null,
    oxygen: 32,
    helium: 0,
    po2_limit: null,
    gas_number: null,
    role: null,
  };

  it("converts a mixture the API recorded nothing optional for into a valid row", () => {
    const result = diveMixtureSchema.safeParse(toDiveMixtureInput(fromApi));
    expect(result.success).toBe(true);
  });

  it("puts every cleared field into the '' state the form fields expect", () => {
    expect(toDiveMixtureInput(fromApi)).toEqual({
      id: 7,
      volume: 11.1,
      start_pressure: "",
      end_pressure: "",
      oxygen: 32,
      helium: 0,
      po2_limit: "",
      // The exception: no input writes it, so it has no cleared state to spell.
      gas_number: undefined,
      role: "",
    });
  });

  it("carries recorded values through untouched", () => {
    const recorded: DiveMixture = {
      ...fromApi,
      start_pressure: 200,
      end_pressure: 50,
      po2_limit: 1.6,
      gas_number: 0,
      role: "deco",
    };

    expect(toDiveMixtureInput(recorded)).toEqual({
      id: 7,
      volume: 11.1,
      start_pressure: 200,
      end_pressure: 50,
      oxygen: 32,
      helium: 0,
      po2_limit: 1.6,
      // Zero, not dropped: a Suunto Ocean numbers its cylinders from 0, so `??`
      // rather than `||` is load-bearing here.
      gas_number: 0,
      role: "deco",
    });
    expect(
      diveMixtureSchema.safeParse(toDiveMixtureInput(recorded)).success,
    ).toBe(true);
  });

  // The round trip the edit form performs on every save: load a dive, change
  // nothing, submit. What comes back out must be what went in, minus the `id`
  // the API rejects and the placeholders that mean "not recorded".
  it("round-trips through normalizeMixtures back to the stored values", () => {
    expect(normalizeMixtures([toDiveMixtureInput(fromApi)])).toEqual([
      {
        volume: 11.1,
        start_pressure: undefined,
        end_pressure: undefined,
        oxygen: 32,
        helium: 0,
        po2_limit: undefined,
        gas_number: undefined,
        role: undefined,
      },
    ]);
  });
});

describe("normalizeMixtures", () => {
  it("converts '' placeholders to undefined", () => {
    const result = normalizeMixtures([
      {
        id: 5,
        volume: 12,
        start_pressure: "",
        end_pressure: "",
        oxygen: 21,
        helium: 0,
      },
    ]);
    expect(result).toEqual([
      {
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

describe("buildDiveUpdate", () => {
  it("omits every field the diver never touched", () => {
    expect(buildDiveUpdate({})).toEqual({});
  });

  // The regression this helper exists for: clearing the trip picker used to
  // produce `undefined`, which was dropped from the PATCH, so the dive kept its
  // trip while the UI and the success toast both claimed otherwise.
  it("sends an explicit null when the trip is cleared", () => {
    const update = buildDiveUpdate({ trip_uuid: null });

    expect(update).toHaveProperty("trip_uuid");
    expect(update.trip_uuid).toBeNull();
  });

  it("leaves the trip alone when the field was untouched", () => {
    expect(buildDiveUpdate({ trip_uuid: undefined })).not.toHaveProperty(
      "trip_uuid",
    );
  });

  it("sends a selected trip through unchanged", () => {
    expect(buildDiveUpdate({ trip_uuid: "trip-uuid" }).trip_uuid).toBe(
      "trip-uuid",
    );
  });

  // Same distinction, for the nullable measurements.
  it("distinguishes a cleared measurement from an untouched one", () => {
    const cleared = buildDiveUpdate({ max_depth: null, weight: null });
    expect(cleared.max_depth).toBeNull();
    expect(cleared.weight).toBeNull();

    expect(buildDiveUpdate({})).not.toHaveProperty("max_depth");
  });

  it("converts the MM:SS duration to seconds", () => {
    expect(buildDiveUpdate({ duration: "45:30" }).duration).toBe(2730);
  });

  it("normalizes mixtures, dropping the empty-string pressure placeholders", () => {
    const update = buildDiveUpdate({
      mixtures: [
        {
          volume: 12,
          start_pressure: 200,
          end_pressure: "",
          oxygen: 21,
          helium: 0,
        },
      ],
    });

    expect(update.mixtures?.[0].end_pressure).toBeUndefined();
    expect(update.mixtures?.[0].start_pressure).toBe(200);
  });

  it("accepts a null trip through the update schema", () => {
    const parsed = diveUpdateSchema.safeParse({ trip_uuid: null });
    expect(parsed.success).toBe(true);
  });
});
