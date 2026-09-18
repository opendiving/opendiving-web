import { z } from "zod";

import type { DivingFigures } from "@/lib/checkin";
import { todayIsoDate } from "@/lib/gear-service";

/**
 * The diving figures as the correction dialog holds them.
 *
 * Nothing here is ever sent anywhere: these three are what gets *printed* on one
 * check-in, not a record. So there are no column bounds to mirror - the numbers are
 * held to what a dive log can mean, and the date to a day that has happened.
 *
 * Metric depth, `null` for a cleared number and `""` for a cleared date, both of them
 * the sentinels the components on the other side already speak (`UnitNumberInput`'s
 * `emptyValue`, `DatePicker`'s empty value). A cleared field prints nothing, which is
 * the summary's own rule for a detail the diver does not hold.
 */
export const divingFiguresSchema = z.object({
  total_dives: z
    .number()
    .int("Use a whole number of dives")
    .min(0, "Dives logged cannot be negative")
    .nullable(),
  // `min(0)` rather than `positive()`, which every depth the dive form takes uses:
  // `/user/dive-stats` answers a diver with nothing logged with zeroes rather than a
  // 404, so `0` is the value this box is *seeded* with for exactly the diver this
  // dialog exists for. Rejecting it blocks the submit on a field they never touched.
  max_depth: z.number().min(0, "Max depth cannot be negative").nullable(),
  last_dive_on: z
    .union([
      z.literal(""),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date"),
    ])
    .refine((value) => !value || value <= todayIsoDate(), {
      message: "A dive cannot be in the future",
    }),
});

export type DivingFiguresInput = z.input<typeof divingFiguresSchema>;

/** The figures as the form holds them. */
export function divingFiguresToForm(
  figures: DivingFigures,
): DivingFiguresInput {
  return {
    total_dives: figures.totalDives,
    max_depth: figures.maxDepth,
    last_dive_on: figures.lastDiveOn ?? "",
  };
}

/** The form's own sentinels back to the summary's. */
export function divingFiguresFromForm(data: DivingFiguresInput): DivingFigures {
  return {
    totalDives: data.total_dives,
    maxDepth: data.max_depth,
    lastDiveOn: data.last_dive_on || null,
  };
}
