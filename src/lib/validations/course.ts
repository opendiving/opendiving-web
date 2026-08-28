import { z } from "zod";
import { CERTIFICATION_AGENCIES } from "@/lib/api/certifications";
import { COURSE_STATUSES } from "@/lib/api/courses";

// Bare "YYYY-MM-DD", optional. `""` is what a cleared date input holds while
// editing, so the empty string is accepted here and mapped back to `null` on
// submit. Kept as a union rather than a `z.preprocess()`/`.transform()`: those
// change what `z.input<>` infers, which breaks the form's field types (see
// DECISIONS.md).
const optionalDate = (message: string) =>
  z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message)]);

// One schema for both creating and editing a course: `CourseDialog` is the only
// form for either and always shows every field, so an update never sends a
// partial object. Lengths mirror the API's columns, so an over-long value is
// caught before the round trip rather than as a 422.
export const courseSchema = z
  .object({
    name: z
      .string()
      .min(1, "Course name is required")
      .max(255, "Course name cannot exceed 255 characters"),
    agency: z.enum(CERTIFICATION_AGENCIES),
    // Only meaningful alongside `agency: "other"`, which the refine below
    // enforces - the same pairing rule the API applies to both models.
    agency_other: z
      .string()
      .max(64, "Agency name cannot exceed 64 characters")
      .optional(),
    status: z.enum(COURSE_STATUSES),
    start_date: optionalDate("Use a valid date").optional(),
    end_date: optionalDate("Use a valid date").optional(),
    instructor_name: z
      .string()
      .max(255, "Instructor name cannot exceed 255 characters")
      .optional(),
    instructor_number: z
      .string()
      .max(64, "Instructor number cannot exceed 64 characters")
      .optional(),
    training_center: z
      .string()
      .max(255, "Training center cannot exceed 255 characters")
      .optional(),
    cost: z.string().max(64, "Cost cannot exceed 64 characters").optional(),
    notes: z
      .string()
      .max(10000, "Notes cannot exceed 10000 characters")
      .optional(),
  })
  // Mirrors the API's `validate_agency_pairing`. An object-level refine, unlike a
  // field-level transform, leaves `z.input<>` untouched.
  .refine((data) => data.agency !== "other" || !!data.agency_other?.trim(), {
    message: "Tell us which agency ran this course",
    path: ["agency_other"],
  })
  // The API refuses this outright (`ck_course_date_range` behind a 422), so this
  // is about saying so beside the field rather than after a round trip. Compared
  // as strings, which is exact for "YYYY-MM-DD" and avoids `new Date()` on a
  // date-only value - see DECISIONS.md.
  .refine(
    (data) =>
      !data.start_date || !data.end_date || data.end_date >= data.start_date,
    {
      message: "End date must be on or after start date",
      path: ["end_date"],
    },
  );

export type CourseInput = z.input<typeof courseSchema>;
