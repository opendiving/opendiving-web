import { z } from "zod";

// Date fields use a plain "YYYY-MM-DD" string (the native value format of
// `<input type="date">`) rather than the "" placeholder trick used for
// numeric fields elsewhere, but the same rule applies: we keep "" as the
// live "empty" value (never `undefined`) so react-hook-form doesn't fall
// back to re-displaying the field's default value. `normalizeTripDates`
// converts "" to `undefined` right before sending data to the API.

// One schema for both creating and editing a trip: `TripDialog` is the only
// form for either, and it always shows every field, so an update never sends a
// partial object.
export const tripFormSchema = z
  .object({
    name: z
      .string()
      .min(1, "Trip name is required")
      .max(255, "Trip name cannot exceed 255 characters"),
    location: z
      .string()
      .max(255, "Location cannot exceed 255 characters")
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
  location?: string;
  start_date?: string;
  end_date?: string;
  notes?: string;
}) {
  return {
    name: data.name,
    location: data.location,
    start_date: data.start_date ? data.start_date : undefined,
    end_date: data.end_date ? data.end_date : undefined,
    notes: data.notes,
  };
}

export type TripFormInput = z.input<typeof tripFormSchema>;
