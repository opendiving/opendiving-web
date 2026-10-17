import { z } from "zod";
import { maxLength, optionalDateField } from "./fields";
import { notesField } from "./notes";
import { requiredName } from "./name";
import { CERTIFICATION_AGENCIES } from "@/lib/api/certifications";

export const certificationSchema = z
  .object({
    agency: z.enum(CERTIFICATION_AGENCIES),
    // Only meaningful alongside `agency: "other"`, which the refine below enforces.
    agency_other: maxLength("Agency name", 64).optional(),
    // The level as printed on the card. Free text: every agency names its levels
    // differently and renames them between syllabus revisions.
    name: requiredName("Certification name", 255),
    certification_number: maxLength("Certification number", 64).optional(),
    certified_on: optionalDateField().optional(),
    expires_on: optionalDateField().optional(),
    instructor_number: maxLength("Instructor number", 64).optional(),
    notes: notesField().optional(),
    // Nullable rather than `""`-empty, unlike the text fields above: these are
    // pickers, and `null` is how one says "none" as against a field nobody
    // touched. Same shape as the dive form's `trip_uuid`/`course_uuid`.
    course_uuid: z.string().nullable().optional(),
    contact_uuid: z.string().nullable().optional(),
    // The person who signed the card, picked like the contact.
    instructor_uuid: z.string().nullable().optional(),
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
