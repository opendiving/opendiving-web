import { z } from "zod";

export const diveSiteCreateSchema = z.object({
  name: z
    .string()
    .min(1, "Dive site name is required")
    .max(255, "Dive site name cannot exceed 255 characters"),
});

export const diveSiteUpdateSchema = z.object({
  name: z
    .string()
    .min(1, "Dive site name is required")
    .max(255, "Dive site name cannot exceed 255 characters")
    .optional(),
});

export type DiveSiteCreateInput = z.input<typeof diveSiteCreateSchema>;
export type DiveSiteUpdateInput = z.input<typeof diveSiteUpdateSchema>;
