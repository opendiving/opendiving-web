import { z } from "zod";

const DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const dateTimeField = (message = "Start time must be in YYYY-MM-DD HH:mm:ss format") =>
  z
    .string()
    .min(1, "Start time is required")
    .regex(DATE_TIME_REGEX, message)
    .refine((val) => !Number.isNaN(new Date(val.replace(" ", "T")).getTime()), {
      message: "Start time must be a valid datetime",
    });

// Optional numeric field that can also hold the literal empty string "" while
// the user is editing. We deliberately never let the *live* form value become
// `undefined` for these fields: react-hook-form falls back to re-displaying a
// field's default value whenever its current value resolves to `undefined`,
// which made these fields appear to "reset" the moment they were cleared.
// Using "" as the empty state avoids that; callers are responsible for
// converting "" to `undefined` right before sending data to the API (see
// `normalizeMixtures` usage in the dive form pages).
export const diveMixtureSchema = z.object({
  id: z.number().optional(),
  name: z.string().max(50, "Name cannot exceed 50 characters").optional(),
  volume: z.number().positive("Volume must be positive"),
  start_pressure: z.union([z.literal(""), z.number().positive("Start pressure must be positive")]).optional(),
  end_pressure: z.union([z.literal(""), z.number().min(0, "End pressure must be zero or positive")]).optional(),
  po2: z.number().positive("PO2 must be positive"),
  oxygen: z
    .number()
    .min(0, "Oxygen percentage must be at least 0")
    .max(100, "Oxygen percentage must be at most 100"),
});

// Converts any "" placeholders (used to represent a cleared optional field
// while editing) into `undefined` before sending mixtures to the API.
export function normalizeMixtures<T extends { start_pressure?: number | ""; end_pressure?: number | "" }>(
  mixtures: T[]
) {
  return mixtures.map((mixture) => ({
    ...mixture,
    start_pressure: mixture.start_pressure === "" ? undefined : mixture.start_pressure,
    end_pressure: mixture.end_pressure === "" ? undefined : mixture.end_pressure,
  }));
}

export const diveCreateSchema = z
  .object({
    dive_number: z
      .number()
      .int()
      .positive("Dive number must be a positive integer"),
    start_time: dateTimeField(),
    duration: z
      .number()
      .int("Duration must be an integer number of seconds")
      .positive("Duration must be positive"),
    max_depth: z.number().positive("Max depth must be positive").optional(),
    avg_depth: z.number().positive("Average depth must be positive").optional(),
    bottom_temperature: z
      .number()
      .int("Bottom temperature must be an integer")
      .optional(),
    visibility: z
      .number()
      .int("Visibility must be an integer")
      .positive("Visibility must be positive")
      .optional(),
    trip_id: z.number().int().positive().optional(),
    notes: z
      .string()
      .max(63206, "Notes cannot exceed 63206 characters")
      .default(""),
    mixtures: z.array(diveMixtureSchema).default([]),
  });

export const diveUpdateSchema = z
  .object({
    dive_number: z
      .number()
      .int()
      .positive("Dive number must be a positive integer")
      .optional(),
    start_time: dateTimeField().optional(),
    duration: z
      .number()
      .int("Duration must be an integer number of seconds")
      .positive("Duration must be positive")
      .optional(),
    max_depth: z.number().positive("Max depth must be positive").optional(),
    avg_depth: z.number().positive("Average depth must be positive").optional(),
    bottom_temperature: z
      .number()
      .int("Bottom temperature must be an integer")
      .optional(),
    visibility: z
      .number()
      .int("Visibility must be an integer")
      .positive("Visibility must be positive")
      .optional(),
    trip_id: z.number().int().positive().optional(),
    notes: z
      .string()
      .max(63206, "Notes cannot exceed 63206 characters")
      .optional(),
    mixtures: z.array(diveMixtureSchema).optional(),
  });

export type DiveCreateInput = z.input<typeof diveCreateSchema>;
export type DiveUpdateInput = z.input<typeof diveUpdateSchema>;
