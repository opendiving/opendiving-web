import { z } from "zod";
import { SERVICE_KINDS } from "@/lib/api/gear-service";

// `""` is what a cleared number input holds while editing, so both interval fields
// accept it and the dialog maps it back to `null` on submit. Kept as a union rather
// than a `z.preprocess()`/`.transform()`: those change what `z.input<>` infers, which
// breaks the form's field types (see DECISIONS.md).
const optionalPositiveInt = (label: string) =>
  z.union([
    z.literal(""),
    z
      .number()
      .int(`${label} must be a whole number`)
      .positive(`${label} must be greater than zero`),
  ]);

export const gearServiceScheduleSchema = z
  .object({
    kind: z.enum(SERVICE_KINDS),
    // Free-text companion to `kind`, and part of what makes a schedule unique on an
    // item - it's how "other" can be used more than once.
    label: z.string().max(120, "Label cannot exceed 120 characters").optional(),
    // Bare "YYYY-MM-DD". Never parsed with `new Date(dateString)` anywhere downstream.
    starts_on: z
      .string()
      .min(1, "An in-service date is required")
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date"),
    interval_months: optionalPositiveInt("Interval in months").optional(),
    interval_dives: optionalPositiveInt("Interval in dives").optional(),
  })
  // Mirrors the API's `require_an_interval` validator and the DB's
  // `ck_gear_service_schedule_has_an_interval`: a rule with neither interval could never
  // become due. An object-level refine, unlike a field-level transform, leaves
  // `z.input<>` untouched.
  .refine(
    (data) =>
      (data.interval_months !== "" && data.interval_months != null) ||
      (data.interval_dives !== "" && data.interval_dives != null),
    {
      message: "Set an interval in months, in dives, or both",
      path: ["interval_months"],
    },
  );

export const gearServiceRecordSchema = z.object({
  kind: z.enum(SERVICE_KINDS),
  label: z.string().max(120, "Label cannot exceed 120 characters").optional(),
  serviced_on: z
    .string()
    .min(1, "A service date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date"),
  performed_by: z.string().max(255, "Cannot exceed 255 characters").optional(),
  notes: z
    .string()
    .max(10000, "Notes cannot exceed 10000 characters")
    .optional(),
});

export type GearServiceScheduleInput = z.input<
  typeof gearServiceScheduleSchema
>;
export type GearServiceRecordInput = z.input<typeof gearServiceRecordSchema>;
