import { z } from "zod";
import { notesField } from "./notes";
import { GEAR_TYPES } from "@/lib/api/gear";

export const gearItemSchema = z.object({
  name: z
    .string()
    .min(1, "Gear name is required")
    .max(255, "Gear name cannot exceed 255 characters"),
  brand: z.string().max(255, "Brand cannot exceed 255 characters").optional(),
  // Optional: gear logged before types existed has none, and forcing a diver to
  // categorize a one-off piece of kit before saving it would be friction for no
  // gain. `""` is what the select holds for "no type" while editing.
  type: z.union([z.literal(""), z.enum(GEAR_TYPES)]).optional(),
  notes: notesField().optional(),
  rented: z.boolean().optional(),
});

export const gearSetSchema = z.object({
  name: z
    .string()
    .min(1, "Set name is required")
    .max(255, "Set name cannot exceed 255 characters"),
  // Optional default ballast in kg, carried into the dive form when the set is
  // loaded. `min(0)` matches `dive.weight` - zero is a real configuration, and a
  // set that simply doesn't record a weight leaves the dive's own value alone.
  weight: z
    .number()
    .min(0, "Weight must be zero or positive")
    .nullable()
    .optional(),
  gear_item_uuids: z.array(z.string()).default([]),
});

export type GearItemInput = z.input<typeof gearItemSchema>;
export type GearSetInput = z.input<typeof gearSetSchema>;
