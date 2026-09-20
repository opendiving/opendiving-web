import { z } from "zod";

// Date fields use a plain "YYYY-MM-DD" string (the native value format of
// `<input type="date">`) rather than the "" placeholder trick used for
// numeric fields elsewhere, but the same rule applies: we keep "" as the
// live "empty" value (never `undefined`) so react-hook-form doesn't fall
// back to re-displaying the field's default value. `normalizeTripDates`
// converts "" to `undefined` right before sending data to the API.

// Coordinates here are plain numbers, not the regex-validated strings the dive
// site form uses (DECISIONS.md): nobody types these. They arrive whole from a
// geocoder result the diver picked, or they are absent because the place was
// typed in by hand - there is no half-entered "-" state to be tolerant of. The
// bounds are the API's, so a nonsense object is caught before the round trip.
const nullableNumber = (limit: number) =>
  z.number().min(-limit).max(limit).nullish();

// The API's own ceilings, exported because the field has to enforce them as it
// builds the list rather than leave them to submit. A part is an object inside
// an array under one `FormField`, and `FormMessage` renders
// `String(error.message)` - which, for an error react-hook-form reports at
// `parts.0.location.name`, is the word "undefined" in red. The diver would be
// told nothing, by a form that had also stopped saving.
export const MAX_LOCATION_NAME_LENGTH = 255;
export const MAX_TRIP_PARTS = 20;

const tripLocationSchema = z.object({
  name: z
    .string()
    .min(1, "Location name is required")
    .max(
      MAX_LOCATION_NAME_LENGTH,
      `Location name cannot exceed ${MAX_LOCATION_NAME_LENGTH} characters`,
    ),
  display_name: z
    .string()
    .max(512, "Location description cannot exceed 512 characters")
    .nullish(),
  latitude: nullableNumber(90),
  longitude: nullableNumber(180),
  bbox_south: nullableNumber(90),
  bbox_north: nullableNumber(90),
  bbox_west: nullableNumber(180),
  bbox_east: nullableNumber(180),
});

// One location as the form holds it: self-describing, so the picker never has to
// resolve an id back into something to show.
export type TripLocationFormValue = z.input<typeof tripLocationSchema>;

// One stretch of a trip. Both halves optional: a transit day is dates with no
// place, and a stop whose timing is not filled in yet is a place with no dates.
//
// The range check is per part rather than per trip, with the issue on the part's
// own `end_date`, so `FormMessage` puts the message under the row that is wrong
// instead of under the first one.
const tripPartSchema = z
  .object({
    location: tripLocationSchema.nullish(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  })
  .refine(
    (part) =>
      !part.start_date || !part.end_date || part.end_date >= part.start_date,
    {
      message: "End date must be on or after start date",
      path: ["end_date"],
    },
  );

// One part as the form holds it.
export type TripPartFormValue = z.input<typeof tripPartSchema>;

// One schema for both creating and editing a trip: `TripDialog` is the only
// form for either, and it always shows every field, so an update never sends a
// partial object.
export const tripFormSchema = z.object({
  name: z
    .string()
    .min(1, "Trip name is required")
    .max(255, "Trip name cannot exceed 255 characters"),
  // Where the trip went and when, in the order the diver arranged it. The trip
  // itself carries no dates: its span is the span of these.
  parts: z
    .array(tripPartSchema)
    .max(
      MAX_TRIP_PARTS,
      `A trip cannot have more than ${MAX_TRIP_PARTS} parts`,
    )
    .optional(),
  notes: z
    .string()
    .max(63206, "Notes cannot exceed 63206 characters")
    .optional(),
});

/**
 * Converts each part's "" date placeholders into `undefined` before sending a
 * trip to the API.
 *
 * The placeholder is what a cleared date field holds while editing - see the
 * note at the top of this file - and the API wants the member absent rather than
 * empty. Per part rather than per trip now that the dates live there; a part
 * whose location is `undefined` sends `null`, which is how the API reads "this
 * stretch has no place" as opposed to "leave it alone".
 */
export function normalizeTripParts(parts?: TripPartFormValue[] | null) {
  return (parts ?? []).map((part) => ({
    start_date: part.start_date ? part.start_date : undefined,
    end_date: part.end_date ? part.end_date : undefined,
    location: part.location ?? null,
  }));
}

export type TripFormInput = z.input<typeof tripFormSchema>;
