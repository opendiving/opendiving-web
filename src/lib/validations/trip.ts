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

// The API's own ceilings, exported because the picker has to enforce them as it
// builds the list rather than leave them to submit. A location is an object
// inside an array under one `FormField`, and `FormMessage` renders
// `String(error.message)` - which, for an error react-hook-form reports at
// `locations.0.name`, is the word "undefined" in red. The diver would be told
// nothing, by a form that had also stopped saving.
export const MAX_LOCATION_NAME_LENGTH = 255;
export const MAX_TRIP_LOCATIONS = 20;

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

// One schema for both creating and editing a trip: `TripDialog` is the only
// form for either, and it always shows every field, so an update never sends a
// partial object.
export const tripFormSchema = z
  .object({
    name: z
      .string()
      .min(1, "Trip name is required")
      .max(255, "Trip name cannot exceed 255 characters"),
    // A trip is where you went, not an itinerary.
    locations: z
      .array(tripLocationSchema)
      .max(
        MAX_TRIP_LOCATIONS,
        `A trip cannot have more than ${MAX_TRIP_LOCATIONS} locations`,
      )
      .optional(),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().optional(),
    notes: z
      .string()
      .max(63206, "Notes cannot exceed 63206 characters")
      .optional(),
  })
  .refine(
    (data) =>
      !data.start_date || !data.end_date || data.end_date >= data.start_date,
    {
      message: "End date must be on or after start date",
      path: ["end_date"],
    },
  );

// Converts "" placeholders (used to represent a cleared date field while
// editing) into `undefined` before sending trip data to the API.
export function normalizeTripDates(data: {
  name?: string;
  start_date?: string;
  end_date?: string;
  notes?: string;
}) {
  return {
    name: data.name,
    start_date: data.start_date ? data.start_date : undefined,
    end_date: data.end_date ? data.end_date : undefined,
    notes: data.notes,
  };
}

export type TripFormInput = z.input<typeof tripFormSchema>;
