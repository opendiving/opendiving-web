import { z } from "zod";

// One schema for both creating and editing a dive site: `DiveSiteDialog` is the
// only form for either, and it always shows every field, so an update never
// sends a partial object.
export const diveSiteFormSchema = z.object({
  name: z
    .string()
    .min(1, "Dive site name is required")
    .max(255, "Dive site name cannot exceed 255 characters"),
  location: z
    .string()
    .max(255, "Location cannot exceed 255 characters")
    .optional(),
  notes: z
    .string()
    .max(63206, "Notes cannot exceed 63206 characters")
    .optional(),
});

export type DiveSiteFormInput = z.input<typeof diveSiteFormSchema>;
