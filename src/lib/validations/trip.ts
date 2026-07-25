import { z } from "zod";

export const tripCreateSchema = z.object({
  name: z
    .string()
    .min(1, "Trip name is required")
    .max(255, "Trip name cannot exceed 255 characters"),
});

export const tripUpdateSchema = z.object({
  name: z
    .string()
    .min(1, "Trip name is required")
    .max(255, "Trip name cannot exceed 255 characters")
    .optional(),
});

export type TripCreateInput = z.input<typeof tripCreateSchema>;
export type TripUpdateInput = z.input<typeof tripUpdateSchema>;
