import { z } from "zod";
import { dateField, maxLength } from "./fields";
import { notesField } from "./notes";
import { SERVICE_KINDS } from "@/lib/api/gear-service";

// The API's `INTERVAL_HOURS_MAX`: a typed interval past it would overflow the
// threshold column the API derives from it, so the API refuses it and this says so
// first.
export const INTERVAL_HOURS_MAX = 1_000_000;

// `""` is what a cleared number input holds while editing, so every interval field
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
    label: maxLength("Label", 120).optional(),
    // Bare "YYYY-MM-DD". Never parsed with `new Date(dateString)` anywhere downstream.
    starts_on: dateField("An in-service date is required"),
    interval_months: optionalPositiveInt("Interval in months").optional(),
    interval_dives: optionalPositiveInt("Interval in dives").optional(),
    interval_hours: z
      .union([
        z.literal(""),
        z
          .number()
          .int("Interval in hours must be a whole number")
          .positive("Interval in hours must be greater than zero")
          .max(
            INTERVAL_HOURS_MAX,
            `Interval in hours cannot exceed ${INTERVAL_HOURS_MAX.toLocaleString("en-US")}`,
          ),
      ])
      .optional(),
  })
  // Mirrors the API's `require_an_interval` validator and the DB's
  // `ck_gear_service_schedule_has_an_interval`: a rule with no interval could never
  // become due. An object-level refine, unlike a field-level transform, leaves
  // `z.input<>` untouched.
  .refine(
    (data) =>
      [data.interval_months, data.interval_dives, data.interval_hours].some(
        (interval) => interval !== "" && interval != null,
      ),
    {
      message: "Set an interval in months, in dives or in hours of diving",
      path: ["interval_months"],
    },
  );

export const gearServiceRecordSchema = z.object({
  kind: z.enum(SERVICE_KINDS),
  label: maxLength("Label", 120).optional(),
  serviced_on: dateField("A service date is required"),
  // A picker, so `null` rather than `""` is "no shop".
  contact_uuid: z.string().nullable().optional(),
  performed_by: maxLength("Serviced by", 255).optional(),
  notes: notesField().optional(),
});

export type GearServiceScheduleInput = z.input<
  typeof gearServiceScheduleSchema
>;
export type GearServiceRecordInput = z.input<typeof gearServiceRecordSchema>;
