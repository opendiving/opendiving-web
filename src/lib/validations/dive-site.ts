import { z } from "zod";

export const diveSiteCreateSchema = z.object({
  name: z
    .string()
    .min(1, "Dive site name is required")
    .max(255, "Dive site name cannot exceed 255 characters"),
  location: z
    .string()
    .max(255, "Location cannot exceed 255 characters")
    .optional(),
  notes: z.string().max(63206, "Notes cannot exceed 63206 characters").optional(),
});

export const diveSiteUpdateSchema = z.object({
  name: z
    .string()
    .min(1, "Dive site name is required")
    .max(255, "Dive site name cannot exceed 255 characters")
    .optional(),
  location: z
    .string()
    .max(255, "Location cannot exceed 255 characters")
    .optional(),
  notes: z.string().max(63206, "Notes cannot exceed 63206 characters").optional(),
});

export type DiveSiteCreateInput = z.input<typeof diveSiteCreateSchema>;
export type DiveSiteUpdateInput = z.input<typeof diveSiteUpdateSchema>;
