import type { UserDiveStats } from "@/lib/api/dive-stats";
import { splitStartTime } from "@/lib/date-time";

/**
 * The three figures the summary's "Diving" section prints.
 *
 * `maxDepth` is metric, like every depth this app holds outside `UnitNumberInput`.
 * `lastDiveOn` is a bare "YYYY-MM-DD" rather than the dive's `start_time`: the sheet
 * prints a date, and normalising here is what lets one line render whether the figure
 * came off `/user/dive-stats` or out of the diver's own correction.
 */
export interface DivingFigures {
  totalDives: number | null;
  maxDepth: number | null;
  lastDiveOn: string | null;
}

/** What the log itself says, which is what the dialog opens on. */
export function loggedDivingFigures(
  stats: UserDiveStats | null,
  lastDiveAt: string | null,
): DivingFigures {
  return {
    totalDives: stats?.total_dives ?? null,
    maxDepth: stats?.max_depth ?? null,
    // The dive's own calendar day, in the offset it was logged in - never the
    // reader's. `formatDiveDateTime` is the other half of the same rule.
    lastDiveOn: lastDiveAt
      ? splitStartTime(lastDiveAt).localDateTime.slice(0, 10)
      : null,
  };
}

/** Whether any of the three has something to print. */
export function hasDivingFigures(figures: DivingFigures): boolean {
  return (
    figures.totalDives !== null ||
    figures.maxDepth !== null ||
    figures.lastDiveOn !== null
  );
}
