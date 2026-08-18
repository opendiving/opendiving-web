"use client";

import { useAuth } from "@/contexts/AuthContext";
import type { UnitSystem } from "@/lib/units";

/**
 * Which system this diver reads measurements in.
 *
 * The one place the preference is read. Components call this once and pass the
 * result down into the pure formatters in `lib/units.ts` - lib code never reaches
 * for context, which is what lets the same functions be tested without React and
 * called from `lib/dive-mixtures.ts` and `lib/dive-profile.ts`.
 *
 * Falls back to metric, which is the column's default and so the answer for every
 * existing row - and is also what renders in the moment before `user` has loaded,
 * where the alternative is a flash of nothing where a number goes.
 */
export function useUnits(): UnitSystem {
  return useAuth().user?.units ?? "metric";
}
