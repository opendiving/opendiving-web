import { z } from "zod";
import { notesField } from "./notes";
import { CERTIFICATION_AGENCIES } from "@/lib/api/certifications";

// Bare "YYYY-MM-DD", optional. `""` is what a cleared date input holds while
// editing, so the empty string is accepted here and mapped back to `null` on
// submit. Kept as a union rather than a `z.preprocess()`/`.transform()`: those
// change what `z.input<>` infers, which breaks the form's field types (see
// DECISIONS.md).
const optionalDate = (message: string) =>
  z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message)]);

export const certificationSchema = z
  .object({
    agency: z.enum(CERTIFICATION_AGENCIES),
    // Only meaningful alongside `agency: "other"`, which the refine below enforces.
    agency_other: z
      .string()
      .max(64, "Agency name cannot exceed 64 characters")
      .optional(),
    // The level as printed on the card. Free text: every agency names its levels
    // differently and renames them between syllabus revisions.
    name: z
      .string()
      .min(1, "Certification name is required")
      .max(255, "Certification name cannot exceed 255 characters"),
    certification_number: z
      .string()
      .max(64, "Certification number cannot exceed 64 characters")
      .optional(),
    certified_on: optionalDate("Use a valid date").optional(),
    expires_on: optionalDate("Use a valid date").optional(),
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
    notes: notesField().optional(),
    // Nullable rather than `""`-empty, unlike the text fields above: this is a
    // picker, and `null` is how it says "no course" as against a field nobody
    // touched. Same shape as the dive form's `trip_uuid`/`course_uuid`.
    course_uuid: z.string().nullable().optional(),
  })
  // Mirrors the API's `_check_agency_other` model validator. An object-level
  // refine, unlike a field-level transform, leaves `z.input<>` untouched.
  .refine((data) => data.agency !== "other" || !!data.agency_other?.trim(), {
    message: "Tell us which agency issued this",
    path: ["agency_other"],
  })
  // A card that expired before it was issued is a data-entry slip, and the API has
  // no constraint against it - catching it here is the only thing that will.
  .refine(
    (data) =>
      !data.certified_on ||
      !data.expires_on ||
      data.expires_on >= data.certified_on,
    {
      message: "Expiry date cannot be before the certification date",
      path: ["expires_on"],
    },
  );

export type CertificationInput = z.input<typeof certificationSchema>;
