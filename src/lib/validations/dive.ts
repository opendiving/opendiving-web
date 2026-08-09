import { z } from "zod";
import { parseUtcOffsetMinutes } from "@/lib/date-time";

// Same offset-aware ISO 8601 shape as the API's `Dive.start_time`, e.g.
// "2021-04-04T10:04:47+02:00" - produced/consumed by `DiveStartTimeField`
// (`components/dives/dive-start-time-field.tsx`), so the form and the API
// always agree on a single `start_time` value with no separate offset field
// to keep in sync.
const dateTimeField = (
  message = "Start time must include a UTC offset, e.g. 2021-04-04T10:04:47+02:00",
) =>
  z
    .string()
    .min(1, "Start time is required")
    .refine((val) => parseUtcOffsetMinutes(val) !== null, { message })
    .refine((val) => !Number.isNaN(new Date(val).getTime()), {
      message: "Start time must be a valid datetime",
    });

// "MM:SS", e.g. "45:30" - minutes can be 1-3 digits, seconds must be two
// digits from 00-59. Converted to/from a plain seconds number right before
// hitting the API via `parseFormDuration()`/`formatDurationForForm()` in
// `lib/date-time.ts` - see `dateTimeField()` above for the same pattern.
const DURATION_REGEX = /^\d{1,3}:[0-5]\d$/;

const durationField = (
  message = "Duration must be in MM:SS format, e.g. 67:30",
) => z.string().min(1, "Duration is required").regex(DURATION_REGEX, message);

// Total ballast carried on the dive, in kilograms. Identical in the create and
// update schemas (it's optional in both), so it lives in one helper rather than
// being written out twice.
const weightField = () =>
  z.number().min(0, "Weight must be zero or positive").nullable().optional();

// Optional numeric field that can also hold the literal empty string "" while
// the user is editing. We deliberately never let the *live* form value become
// `undefined` for these fields: react-hook-form falls back to re-displaying a
// field's default value whenever its current value resolves to `undefined`,
// which made these fields appear to "reset" the moment they were cleared.
// Using "" as the empty state avoids that; callers are responsible for
// converting "" to `undefined` right before sending data to the API (see
// `normalizeMixtures` usage in the dive form pages).
export const diveMixtureSchema = z
  .object({
    id: z.number().optional(),
    name: z.string().max(50, "Name cannot exceed 50 characters").optional(),
    volume: z.number().positive("Volume must be positive"),
    start_pressure: z
      .union([
        z.literal(""),
        z.number().positive("Start pressure must be positive"),
      ])
      .optional(),
    end_pressure: z
      .union([
        z.literal(""),
        z.number().min(0, "End pressure must be zero or positive"),
      ])
      .optional(),
    oxygen: z
      .number()
      .min(0, "Oxygen percentage must be at least 0")
      .max(100, "Oxygen percentage must be at most 100"),
    helium: z
      .number()
      .min(0, "Helium percentage must be at least 0")
      .max(100, "Helium percentage must be at most 100"),
  })
  .refine(
    (mixture) => {
      const start = mixture.start_pressure;
      const end = mixture.end_pressure;
      if (start === "" || start === undefined) return true;
      if (end === "" || end === undefined) return true;
      return end <= start;
    },
    {
      message: "End pressure cannot be greater than start pressure",
      path: ["end_pressure"],
    },
  );

export type DiveMixtureInput = z.input<typeof diveMixtureSchema>;

export interface NormalizedDiveMixture {
  name?: string;
  volume: number;
  start_pressure?: number;
  end_pressure?: number;
  oxygen: number;
  helium: number;
}

// Converts any "" placeholders (used to represent a cleared optional field
// while editing) into `undefined` before sending mixtures to the API. Also
// strips the client-side `id` field: the API replaces all of a dive's
// mixtures wholesale on every save (delete-all + re-insert) and its create
// schema doesn't accept an `id`, so echoing back an existing mixture's id
// would be rejected as an unexpected field.
//
// Fields are listed out explicitly (rather than spreading the input and
// overriding start_pressure/end_pressure) because TypeScript doesn't reliably
// narrow a spread-then-overridden property away from its original generic
// union type, which previously let the "" placeholder type leak into the
// inferred return type.
export function normalizeMixtures(
  mixtures: {
    id?: number;
    name?: string;
    volume: number;
    start_pressure?: number | "";
    end_pressure?: number | "";
    oxygen: number;
    helium: number;
  }[],
): NormalizedDiveMixture[] {
  return mixtures.map((mixture) => ({
    name: mixture.name,
    volume: mixture.volume,
    start_pressure:
      mixture.start_pressure === "" ? undefined : mixture.start_pressure,
    end_pressure:
      mixture.end_pressure === "" ? undefined : mixture.end_pressure,
    oxygen: mixture.oxygen,
    helium: mixture.helium,
  }));
}

export const diveCreateSchema = z.object({
  dive_number: z
    .number()
    .int()
    .positive("Dive number must be a positive integer"),
  start_time: dateTimeField(),
  duration: durationField(),
  max_depth: z
    .number()
    .positive("Max depth must be positive")
    .nullable()
    .optional(),
  avg_depth: z
    .number()
    .positive("Average depth must be positive")
    .nullable()
    .optional(),
  bottom_temperature: z.number().nullable().optional(),
  visibility: z
    .number()
    .int("Visibility must be an integer")
    .positive("Visibility must be positive")
    .nullable()
    .optional(),
  // Kilograms. `min(0)` rather than `positive()`, unlike the depths above:
  // diving with no lead at all is a real entry, and it's worth distinguishing
  // from not having recorded it - mirrors `ck_dive_weight_non_negative`.
  weight: weightField(),
  trip_uuid: z.string().optional(),
  dive_site_uuids: z.array(z.string()).default([]),
  gear_item_uuids: z.array(z.string()).default([]),
  notes: z
    .string()
    .max(63206, "Notes cannot exceed 63206 characters")
    .default(""),
  mixtures: z.array(diveMixtureSchema).default([]),
});

export const diveUpdateSchema = z.object({
  dive_number: z
    .number()
    .int()
    .positive("Dive number must be a positive integer")
    .optional(),
  start_time: dateTimeField().optional(),
  duration: durationField().optional(),
  max_depth: z
    .number()
    .positive("Max depth must be positive")
    .nullable()
    .optional(),
  avg_depth: z
    .number()
    .positive("Average depth must be positive")
    .nullable()
    .optional(),
  bottom_temperature: z.number().nullable().optional(),
  visibility: z
    .number()
    .int("Visibility must be an integer")
    .positive("Visibility must be positive")
    .nullable()
    .optional(),
  weight: weightField(),
  trip_uuid: z.string().optional(),
  dive_site_uuids: z.array(z.string()).optional(),
  gear_item_uuids: z.array(z.string()).optional(),
  notes: z
    .string()
    .max(63206, "Notes cannot exceed 63206 characters")
    .optional(),
  mixtures: z.array(diveMixtureSchema).optional(),
});

export type DiveCreateInput = z.input<typeof diveCreateSchema>;
export type DiveUpdateInput = z.input<typeof diveUpdateSchema>;
