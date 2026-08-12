// The calendar windowing the dashboard's two trend charts share: which slice of a
// series is on screen, what it's called, which slices are worth offering, and how
// to step between them.
//
// Moved out of `lib/dive-gas.ts` and `lib/gas-use-view.ts`, unchanged, once
// `DiveActivityCard` grew the same three scopes - the same move `niceDomain`/
// `axisTicks` made to `lib/chart-scale.ts` before it. Nothing here is about gas,
// and the alternative was a second copy of a fortnight of calendar edge cases in
// `dive-activity.ts`: the two cards sit one above the other and their period
// controls are meant to behave identically, which is a promise one shared module
// keeps and two similar ones only make.
//
// Everything reads and builds timestamps in UTC (`Date.UTC`, `getUTC*`) because
// every time fed to it is a wall-clock instant - a dive's own local time encoded
// into a UTC-reading number by `diveWallClockTime()`, or a calendar bucket built
// with `Date.UTC` by `activityDays()`. Using the local getters would re-interpret
// those through the viewer's timezone and drop a New Year's Eve dive into the
// wrong year depending on where it's being looked at from.

// How much of a series is on screen at once. A career in one frame shows the long
// arc and buries a single trip; a month shows the trip and no arc. Both are worth
// looking at, so it's a switch rather than a choice made once here.
export type ChartScope = "all" | "year" | "month";

export const CHART_SCOPES: ChartScope[] = ["all", "year", "month"];

export const CHART_SCOPE_LABELS: Record<ChartScope, string> = {
  all: "All",
  year: "Year",
  month: "Month",
};

// The half-open `[start, end)` bounds of the calendar period containing `anchor`.
export function periodRange(
  anchor: number,
  scope: "year" | "month",
): { start: number; end: number } {
  const date = new Date(anchor);
  const year = date.getUTCFullYear();

  if (scope === "year") {
    return { start: Date.UTC(year, 0, 1), end: Date.UTC(year + 1, 0, 1) };
  }

  const month = date.getUTCMonth();
  return { start: Date.UTC(year, month, 1), end: Date.UTC(year, month + 1, 1) };
}

// What to call the period on screen: "All time", "2026", "April 2026".
export function periodLabel(anchor: number, scope: ChartScope): string {
  if (scope === "all") return "All time";

  return new Date(anchor).toLocaleDateString("en-US", {
    ...(scope === "month" ? { month: "long" } : {}),
    year: "numeric",
    timeZone: "UTC",
  });
}

export interface ChartPeriod {
  // The period's start, as a stable identity for it. This, not `anchor`, is what
  // a dropdown option's value has to be: an arbitrary sample's timestamp is not a
  // value the current anchor can be compared against, and a `<Select>` whose
  // value matches no registered item renders an empty trigger (see the
  // `VolumeCombobox` "NaN L" note in DECISIONS.md).
  start: number;
  // A real sample's timestamp inside the period, for use as the chart's anchor.
  anchor: number;
}

// Every calendar period that actually contains data, oldest first - the options a
// period dropdown offers.
//
// Each carries a real sample's timestamp rather than just the period's start, so
// picking one preserves the invariant that the anchor is always a time something
// was logged at. Without that, choosing "2025" and then switching to Month would
// land on January 2025, which may well be empty.
export function availablePeriods(
  times: number[],
  scope: "year" | "month",
): ChartPeriod[] {
  const byPeriod = new Map<number, number>();

  for (const time of times) {
    // `times` is chronological and later writes win, so each period ends up
    // represented by its most recent sample - the same most-recent bias the
    // charts open with.
    byPeriod.set(periodRange(time, scope).start, time);
  }

  return [...byPeriod].map(([start, anchor]) => ({ start, anchor }));
}

// The anchor for the nearest period in `direction` that actually contains data,
// or `null` when there is none - which is what disables the button.
//
// Skipping straight to the next period *with data*, rather than stepping one
// calendar period at a time, is the whole difference between usable and not for
// this data: diving happens in bursts a season apart, so stepping would mean
// clicking through eight empty months to reach the next trip.
export function stepPeriod(
  anchor: number,
  scope: "year" | "month",
  direction: 1 | -1,
  times: number[],
): number | null {
  const { start, end } = periodRange(anchor, scope);

  if (direction === 1) {
    return times.find((time) => time >= end) ?? null;
  }

  const earlier = times.filter((time) => time < start);
  return earlier.length > 0 ? earlier[earlier.length - 1] : null;
}

// A remembered anchor made safe against the logbook as it exists *now*, or null
// to fall back to the most recent sample.
//
// It has to be checked rather than used as stored. A dive can be deleted or have
// its time edited between visits, and the anchor carries an invariant the cards
// lean on: it is a real sample's timestamp, inside a period that has data.
// Restoring a timestamp that no longer satisfies that renders a period select
// with no matching option - an empty trigger, the same failure noted on
// `ChartPeriod.start`.
//
// The period fallback is the useful half of this: edit one dive's time and you
// should still land on the month you were reading, not be thrown back to the most
// recent one.
export function resolveAnchor(
  stored: number | null,
  scope: ChartScope,
  times: number[],
): number | null {
  if (stored === null || times.length === 0) return null;

  // The sample itself is still there and still where it was.
  if (times.includes(stored)) return stored;

  // "All" has no period to fall back to - it plots everything either way.
  if (scope === "all") return null;

  const { start } = periodRange(stored, scope);
  const period = availablePeriods(times, scope).find(
    (candidate) => candidate.start === start,
  );

  return period ? period.anchor : null;
}
