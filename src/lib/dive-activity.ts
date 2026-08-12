// How much the diver has actually been diving, bucketed for the dashboard's
// activity chart. The counting itself happens in the API (`/user/dive-activity`,
// one entry per month with diving in it); everything here is about turning that
// sparse series into the fixed grid a bar chart needs.
//
// Deliberately separate from `dive-gas.ts`, whose scope machinery this rhymes
// with rather than reuses. That one anchors on a *dive's timestamp*, because its
// points are dives and switching scope has to land on the one you were reading;
// this one has no dives to anchor to - a bar is a calendar bucket - so its
// period is a plain year number and its arithmetic is integers rather than
// instants. Sharing a module would mean one of the two carrying the other's
// concept for no gain.

import type { DiveActivityPoint } from "@/lib/api/dive-stats";

// Whether a bar is a year of a career or a month of one year.
//
// No "all" scope, unlike the gas chart: "every year" *is* this chart's whole
// view, so `year` already answers what `all` answers there.
export type DiveActivityScope = "year" | "month";

export const DIVE_ACTIVITY_SCOPES: DiveActivityScope[] = ["year", "month"];

export const DIVE_ACTIVITY_SCOPE_LABELS: Record<DiveActivityScope, string> = {
  year: "Year",
  month: "Month",
};

export interface ActivityBar {
  // Identity within the view - a calendar year, or a month 1-12. Unique per
  // view, so it's also the React key.
  key: number;
  // Under the axis. Kept short enough that twelve of them fit across the plot.
  label: string;
  // The same bucket said in full ("August 2026"), for the tooltip and the
  // chart's description, where there is room and no neighbouring label to infer
  // the year from.
  name: string;
  dives: number;
}

// A month's name, from the platform rather than a hardcoded table, so it reads
// the same way as every other date in the app (see `periodLabel` in
// `dive-gas.ts`). The year is arbitrary and never shown - this is naming a
// month, not a date - and `timeZone: "UTC"` keeps the constructed date from
// sliding into the previous month for viewers west of Greenwich.
function monthName(month: number, style: "short" | "long"): string {
  return new Date(Date.UTC(2001, month - 1, 1)).toLocaleDateString("en-US", {
    month: style,
    timeZone: "UTC",
  });
}

// Dives per calendar year, keyed by year.
function yearTotals(points: DiveActivityPoint[]): Map<number, number> {
  const totals = new Map<number, number>();

  for (const point of points) {
    totals.set(point.year, (totals.get(point.year) ?? 0) + point.dives);
  }

  return totals;
}

// Every year the diver logged at least one dive in, oldest first - the years the
// period control offers and steps between.
//
// Only years with diving, for the same reason `availablePeriods` lists only
// periods with dives: a dropdown of empty years is a list of things not worth
// looking at, and stepping through them one at a time to reach the next season
// is the failure that control exists to avoid.
export function divingYears(points: DiveActivityPoint[]): number[] {
  return [...yearTotals(points).keys()].sort((a, b) => a - b);
}

// The bars to draw, in calendar order, including the empty ones.
//
// Empty buckets are the point of this function. A chart of only the months that
// had diving would space three trips evenly across the plot and quietly say the
// year was busy throughout; the gaps are what make a season legible as a season.
// It's the same call `dive-gas.ts` makes by plotting a period's *calendar*
// bounds rather than the extent of what's in it.
//
// The year scope spans the first year with diving to the last, so a year taken
// off appears as the gap it was - but nothing is drawn before someone started
// diving or after their most recent dive, where there is no data rather than no
// diving.
export function activityBars(
  points: DiveActivityPoint[],
  scope: DiveActivityScope,
  year: number,
): ActivityBar[] {
  if (scope === "month") {
    const dives = new Map(
      points
        .filter((point) => point.year === year)
        .map((point) => [point.month, point.dives]),
    );

    return Array.from({ length: 12 }, (_, index) => index + 1).map((month) => ({
      key: month,
      label: monthName(month, "short"),
      name: `${monthName(month, "long")} ${year}`,
      dives: dives.get(month) ?? 0,
    }));
  }

  const totals = yearTotals(points);
  const years = [...totals.keys()];
  if (years.length === 0) return [];

  const first = Math.min(...years);
  const last = Math.max(...years);

  return Array.from(
    { length: last - first + 1 },
    (_, index) => first + index,
  ).map((candidate) => ({
    key: candidate,
    label: String(candidate),
    name: String(candidate),
    dives: totals.get(candidate) ?? 0,
  }));
}

// The tallest bar the scope can ever produce, across the whole logbook - what
// the y axis is scaled to.
//
// Deliberately not the tallest bar in *this* year, which is the same call the
// gas chart makes for its own domain and matters more here: bar height is the
// quantity, so a per-year axis would draw a four-dive August exactly as tall as
// a forty-dive one, and paging between years - the whole point of the arrows -
// would compare nothing.
export function barCeiling(
  points: DiveActivityPoint[],
  scope: DiveActivityScope,
): number {
  const counts =
    scope === "month"
      ? points.map((point) => point.dives)
      : [...yearTotals(points).values()];

  return counts.length === 0 ? 0 : Math.max(...counts);
}

// The nearest year in `direction` that actually contains dives, or null when
// there is none - which is what disables the arrow.
//
// `years` is `divingYears`' output, so this skips the fallow years rather than
// stepping one calendar year at a time.
export function stepYear(
  year: number,
  direction: 1 | -1,
  years: number[],
): number | null {
  if (direction === 1) {
    return years.find((candidate) => candidate > year) ?? null;
  }

  const earlier = years.filter((candidate) => candidate < year);
  return earlier.length > 0 ? earlier[earlier.length - 1] : null;
}

export interface DiveActivitySummary {
  // Dives in the view: the whole logbook at the year scope, one year at the
  // month scope.
  dives: number;
  // The fullest bar in the view, and what to call it.
  busiestLabel: string;
  busiestDives: number;
  // Change against the previous year *with diving*, in dives rather than
  // percent: these are small whole numbers a diver can hold in their head, and
  // "12 more than 2025" says something "+150%" doesn't, from 8 dives to 20.
  // Null when there is nothing to compare against - the year scope, which spans
  // everything, or the first year of diving.
  change: number | null;
  // What that previous year is called. Null exactly when `change` is.
  previousLabel: string | null;
}

// The figures above the chart: how much diving is in the view, when the best of
// it happened, and whether there is more of it than last year.
//
// The bars show the shape; this answers "am I diving more", which is the
// question the card exists for. Returns null when the view holds no dives at
// all, which the year scope can only hit on an empty logbook.
export function summarizeActivity(
  points: DiveActivityPoint[],
  scope: DiveActivityScope,
  year: number,
): DiveActivitySummary | null {
  const bars = activityBars(points, scope, year);
  const dives = bars.reduce((total, bar) => total + bar.dives, 0);
  if (dives === 0) return null;

  // Scanned in calendar order and kept on a strict `>`, so a tie resolves to the
  // earlier bucket every time rather than to whichever the sort happened to
  // move. The label is the short form at the month scope - "August", with the
  // year already stated by the control above it.
  const busiest = bars.reduce((best, bar) =>
    bar.dives > best.dives ? bar : best,
  );
  const summary: DiveActivitySummary = {
    dives,
    busiestLabel:
      scope === "month" ? monthName(busiest.key, "long") : busiest.name,
    busiestDives: busiest.dives,
    change: null,
    previousLabel: null,
  };

  if (scope === "year") return summary;

  const previousYear = stepYear(year, -1, divingYears(points));
  if (previousYear === null) return summary;

  const previous = yearTotals(points).get(previousYear) ?? 0;

  return {
    ...summary,
    change: dives - previous,
    previousLabel: String(previousYear),
  };
}
