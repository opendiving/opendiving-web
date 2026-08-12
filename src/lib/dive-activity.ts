// How much the diver has actually been diving, bucketed for the dashboard's
// activity chart. The counting itself happens in the API (`/user/dive-activity`,
// one entry per day with diving in it); everything here is about turning that
// sparse series into the fixed grid a bar chart needs.
//
// The three scopes are the same three the gas card offers, and deliberately so -
// the two cards sit one above the other, and a control that reads the same in
// both places has to mean the same thing in both. What differs is only what a bar
// *is*: a day, a month or a year of the logbook, against the gas chart's
// individual dives.
//
// The calendar arithmetic behind those scopes - which period is on screen, what
// it's called, which ones are worth offering, how to step between them - lives in
// `lib/chart-period.ts` and is shared with the gas card rather than reimplemented
// here. This module used to carry its own, on plain year integers, because a bar
// is a calendar bucket and there were no dives to anchor to; day buckets removed
// that difference, since a day *is* an instant the chart can anchor on.

import type { DiveActivityPoint } from "@/lib/api/dive-stats";
import {
  type ChartScope,
  periodLabel,
  periodRange,
  stepPeriod,
} from "@/lib/chart-period";

export interface ActivityBar {
  // Identity within the view - a calendar year, a month 1-12, or a day of the
  // month. Unique per view, so it's also the React key.
  key: number;
  // Under the axis. Kept short enough that twelve of them - or thirty-one - fit
  // across the plot.
  label: string;
  // The same bucket said in full ("August 12, 2026"), for the tooltip and the
  // chart's description, where there is room and no neighbouring label to infer
  // the month or year from.
  name: string;
  dives: number;
}

// The UTC instant a bucket starts at - the form every function in
// `chart-period.ts` speaks. Built with `Date.UTC` and read back with `getUTC*`
// throughout, for the reason that module documents: these are wall-clock buckets
// the API already resolved in the dives' own local time, and re-reading them
// through the viewer's timezone would slide a New Year's Eve dive into the wrong
// year.
function dayStart(point: DiveActivityPoint): number {
  return Date.UTC(point.year, point.month - 1, point.day);
}

// A month's name, from the platform rather than a hardcoded table, so it reads
// the same way as every other date in the app (see `periodLabel`). The year is
// arbitrary and never shown - this is naming a month, not a date - and
// `timeZone: "UTC"` keeps the constructed date from sliding into the previous
// month for viewers west of Greenwich.
function monthName(month: number, style: "short" | "long"): string {
  return new Date(Date.UTC(2001, month - 1, 1)).toLocaleDateString("en-US", {
    month: style,
    timeZone: "UTC",
  });
}

// How many days a month has, without a leap-year table: day 0 of the *next*
// month is the last day of this one.
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Every day the diver logged at least one dive on, oldest first - what the period
// controls step through and pick from.
//
// The anchor the card carries is always one of these, which is the invariant that
// makes switching scope land somewhere useful: going from Year to Month shows the
// month *containing* the day you were reading, not an arbitrary month that may be
// empty. Left in the API's order, which `bucket_by_day` sorts on the buckets
// themselves rather than on the instants they came from.
export function activityDays(points: DiveActivityPoint[]): number[] {
  return points.map(dayStart);
}

// Dives per calendar year, keyed by year.
function yearTotals(points: DiveActivityPoint[]): Map<number, number> {
  const totals = new Map<number, number>();

  for (const point of points) {
    totals.set(point.year, (totals.get(point.year) ?? 0) + point.dives);
  }

  return totals;
}

// Dives per calendar month across the whole logbook, keyed by the month's own UTC
// start - the same key `periodRange` produces, so nothing here invents a second
// identity for a month.
function monthTotals(points: DiveActivityPoint[]): Map<number, number> {
  const totals = new Map<number, number>();

  for (const point of points) {
    const start = Date.UTC(point.year, point.month - 1, 1);
    totals.set(start, (totals.get(start) ?? 0) + point.dives);
  }

  return totals;
}

// The bars to draw, in calendar order, including the empty ones.
//
// Empty buckets are the point of this function. A chart of only the months that
// had diving would space three trips evenly across the plot and quietly say the
// year was busy throughout; the gaps are what make a season legible as a season.
// It's the same call the gas chart makes by plotting a period's *calendar* bounds
// rather than the extent of what's in it.
//
// The "all" scope spans the first year with diving to the last, so a year taken
// off appears as the gap it was - but nothing is drawn before someone started
// diving or after their most recent dive, where there is no data rather than no
// diving. The bounded scopes have their own calendar bounds and use them: twelve
// months whatever the year held, and every day of the month whatever the trip
// covered.
export function activityBars(
  points: DiveActivityPoint[],
  scope: ChartScope,
  anchor: number,
): ActivityBar[] {
  if (scope === "month") {
    const date = new Date(anchor);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const dives = new Map(
      points
        .filter((point) => point.year === year && point.month === month)
        .map((point) => [point.day, point.dives]),
    );

    return Array.from(
      { length: daysInMonth(year, month) },
      (_, index) => index + 1,
    ).map((day) => ({
      key: day,
      label: String(day),
      // "August 12, 2026" - the platform's own long date, so the hover card reads
      // the way every other date in the app does.
      name: new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(
        "en-US",
        { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" },
      ),
      dives: dives.get(day) ?? 0,
    }));
  }

  if (scope === "year") {
    const year = new Date(anchor).getUTCFullYear();
    const dives = new Map<number, number>();
    for (const point of points) {
      if (point.year !== year) continue;
      dives.set(point.month, (dives.get(point.month) ?? 0) + point.dives);
    }

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

// The tallest bar the scope can ever produce, across the whole logbook - what the
// y axis is scaled to.
//
// Deliberately not the tallest bar in *this* period, which is the same call the
// gas chart makes for its own domain and matters more here: bar height is the
// quantity, so a per-year axis would draw a four-dive August exactly as tall as a
// forty-dive one, and paging between periods - the whole point of the arrows -
// would compare nothing.
export function barCeiling(
  points: DiveActivityPoint[],
  scope: ChartScope,
): number {
  const counts =
    scope === "month"
      ? points.map((point) => point.dives)
      : scope === "year"
        ? [...monthTotals(points).values()]
        : [...yearTotals(points).values()];

  return counts.length === 0 ? 0 : Math.max(...counts);
}

// Dives logged inside a half-open `[start, end)` window of days.
function divesIn(
  points: DiveActivityPoint[],
  range: { start: number; end: number },
): number {
  return points.reduce((total, point) => {
    const day = dayStart(point);
    return day >= range.start && day < range.end ? total + point.dives : total;
  }, 0);
}

export interface DiveActivitySummary {
  // Dives in the view: the whole logbook at the "all" scope, one year or one
  // month at the bounded ones.
  dives: number;
  // The fullest bar in the view, and what to call it.
  busiestLabel: string;
  busiestDives: number;
  // Change against the previous period *with diving*, in dives rather than
  // percent: these are small whole numbers a diver can hold in their head, and
  // "12 more than 2025" says something "+150%" doesn't, from 8 dives to 20. Null
  // when there is nothing to compare against - the "all" scope, which spans
  // everything, or the first period of diving.
  change: number | null;
  // What that previous period is called. Null exactly when `change` is.
  previousLabel: string | null;
}

// The figures above the chart: how much diving is in the view, when the best of
// it happened, and whether there is more of it than last time.
//
// The bars show the shape; this answers "am I diving more", which is the question
// the card exists for. Returns null when the view holds no dives at all, which
// the "all" scope can only hit on an empty logbook.
export function summarizeActivity(
  points: DiveActivityPoint[],
  scope: ChartScope,
  anchor: number,
): DiveActivitySummary | null {
  const bars = activityBars(points, scope, anchor);
  const dives = bars.reduce((total, bar) => total + bar.dives, 0);
  if (dives === 0) return null;

  // Scanned in calendar order and kept on a strict `>`, so a tie resolves to the
  // earlier bucket every time rather than to whichever the sort happened to move.
  // The label drops whatever the period control above it already states: the year
  // at the month scope, the year *and* month at the day scope.
  const busiest = bars.reduce((best, bar) =>
    bar.dives > best.dives ? bar : best,
  );
  const summary: DiveActivitySummary = {
    dives,
    busiestLabel: busiestName(busiest, scope, anchor),
    busiestDives: busiest.dives,
    change: null,
    previousLabel: null,
  };

  if (scope === "all") return summary;

  // The previous period *with diving*, not the previous calendar one - the same
  // rule the arrows step by, and for the same reason: diving happens in bursts,
  // and "vs last month" is meaningless when last month was the off-season.
  const previousAnchor = stepPeriod(anchor, scope, -1, activityDays(points));
  if (previousAnchor === null) return summary;

  const previousRange = periodRange(previousAnchor, scope);

  return {
    ...summary,
    change: dives - divesIn(points, previousRange),
    previousLabel: periodLabel(previousRange.start, scope),
  };
}

// What to call the busiest bar, with whatever the period control already says
// left off it.
function busiestName(
  bar: ActivityBar,
  scope: ChartScope,
  anchor: number,
): string {
  if (scope === "all") return bar.name;
  if (scope === "year") return monthName(bar.key, "long");

  const date = new Date(anchor);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), bar.key),
  ).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
