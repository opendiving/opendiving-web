import { z } from "zod";
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
  notes: z
    .string()
    .max(63206, "Notes cannot exceed 63206 characters")
    .optional(),
  rented: z.boolean().optional(),
});

export const gearSetSchema = z.object({
  name: z
    .string()
    .min(1, "Set name is required")
    .max(255, "Set name cannot exceed 255 characters"),
  gear_item_uuids: z.array(z.string()).default([]),
});

export type GearItemInput = z.input<typeof gearItemSchema>;
export type GearSetInput = z.input<typeof gearSetSchema>;
