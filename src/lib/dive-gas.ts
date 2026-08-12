import type { Dive } from "@/lib/api/dives";
import {
  type ChartScope,
  periodLabel,
  periodRange,
  stepPeriod,
} from "@/lib/chart-period";

// `niceDomain` and `axisTicks` used to live here. They moved, unchanged, to
// `lib/chart-scale.ts` once the dive profile chart needed them too - a depth
// axis has nothing to do with gas use, and importing a gas module to scale
// meters reads as an accident. Their tests moved with them, to
// `chart-scale.test.ts`.
//
// The scope type and the period machinery it names - `periodRange`,
// `periodLabel`, `availablePeriods`, `stepPeriod` - made the same move, to
// `lib/chart-period.ts`, once the activity card grew the same three scopes.
// Windowing a series to a calendar period is not a fact about gas either.

// How many dives the trend line averages over, per scope.
//
// A single dive's RMV swings on current, cold, workload and task loading, so
// the raw points are noise around a signal. How much smoothing that noise needs
// depends on how much history is on screen, because the question being asked
// changes with it: a month is one trip and "how did this week go" wants a window
// short enough to bend inside it, while a career is asking "am I getting better"
// and a five-dive mean across five hundred dives just redraws the noise at
// trip scale.
//
// Five is roughly a day's diving; ten is roughly a trip; twenty is a couple of
// them, which is about the resolution a multi-year arc is legible at.
const TREND_WINDOWS: Record<ChartScope, number> = {
  month: 5,
  year: 10,
  all: 20,
};

// Never smooth over more than this fraction of the whole series. A window that
// covers most of a diver's history turns the trend into a cumulative average -
// a line that only ever drifts toward the overall mean and can't respond to
// anything - which is the exact failure a new diver looking at "All" would hit
// first, and the one most likely to be read as "my consumption never changes".
const MAX_TREND_FRACTION = 3;

export const MIN_TREND_WINDOW = 5;

// The window to smooth with, for a scope and a series of `diveCount` dives.
export function trendWindow(scope: ChartScope, diveCount: number): number {
  return Math.max(
    MIN_TREND_WINDOW,
    Math.min(TREND_WINDOWS[scope], Math.floor(diveCount / MAX_TREND_FRACTION)),
  );
}

// Trailing mean of the last `window` values (fewer at the start of the series,
// so the line begins at the first point rather than `window` points in - a gap
// at the left edge reads as missing data).
export function rollingMean(values: number[], window: number): number[] {
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - window + 1), index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

// The spread of the same trailing window `rollingMean` averages, as a standard
// deviation - what the chart draws as a band around the trend line.
//
// The band is there because a bare trend line answers "how much" but not "how
// consistently", and consistency is most of what improving gas consumption
// actually looks like: a diver whose dives cluster at 16-18 L/min is in better
// control than one averaging the same figure from 12s and 22s. It also gives the
// line some body without the dishonesty of filling to the axis - this chart's y
// axis deliberately doesn't start at zero (see `niceDomain`), so the area under
// the trend is not a quantity and shading it would encode nothing.
//
// Population standard deviation, dividing by `n` rather than `n - 1`: this
// describes the window it was computed from rather than estimating a wider
// population from it, and the sample form would divide by zero on the first
// point, where the window holds one dive.
export function rollingStdDev(values: number[], window: number): number[] {
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - window + 1), index + 1);
    const mean = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    const variance =
      slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / slice.length;

    return Math.sqrt(variance);
  });
}

// The three marks sharing the gas chart's plot, each of which the diver can turn
// off. The trend and its spread band are one mark, not two: the band is what
// gives the line body and says how tightly the dives it averages were clustered,
// so a chart with one and not the other says less than either alone. (The band
// is still dropped at the "all" scope, where a fortnight of diving is four units
// wide and it collapses into a smear - see `GasUseChart`.)
export const GAS_USE_MARKS = ["dives", "trend", "average"] as const;

export type GasUseMark = (typeof GAS_USE_MARKS)[number];

// The half-open `[start, end)` bounds the chart actually plots, for any scope.
//
// "year"/"month" are just `periodRange`. "all" is the whole series, and the
// subtlety is entirely in its `end`: callers filter with `time < end`, so an
// `end` of exactly the last dive's timestamp drops that dive - always the
// newest one, and every dive tied with it. `+1` is enough to make the bound
// inclusive of the last sample while keeping the half-open convention that
// `periodRange` and every caller already rely on.
//
// `times` must be sorted ascending and non-empty; an empty series has no range
// to speak of and returns a degenerate `[0, 1)` rather than `NaN` bounds.
export function scopeRange(
  times: number[],
  anchor: number,
  scope: ChartScope,
): { start: number; end: number } {
  if (scope !== "all") return periodRange(anchor, scope);
  if (times.length === 0) return { start: 0, end: 1 };
  return { start: times[0], end: times[times.length - 1] + 1 };
}

// The sub-periods to shade behind the plot, so alternate months (within a year)
// or alternate years (across a career) read as separate blocks.
//
// This is the chart's only vertical structure. Without it the x labels float
// under a plot whose horizontal position means nothing in particular, and a
// cluster of dots is impossible to place in the year without tracing down to the
// axis. Shading is deliberately the mechanism rather than gridlines: a diving
// season is an *interval*, not an instant, so a band is the honest mark for it -
// and a chart that already carries dots, a trend, a spread band and a reference
// line does not need twelve more lines drawn through it.
//
// A month is too short to subdivide usefully, so it gets none. Everything is
// clamped to the plotted range, which matters for "all" - a career starts
// partway through its first year and ends partway through its last.
export function bandRanges(
  scope: ChartScope,
  range: { start: number; end: number },
): { start: number; end: number }[] {
  if (scope === "month") return [];

  const bands: { start: number; end: number }[] = [];

  if (scope === "year") {
    const year = new Date(range.start).getUTCFullYear();
    // February, April, ... - the first month unshaded, so January reads against
    // the card rather than against a band.
    for (let month = 1; month < 12; month += 2) {
      bands.push({
        start: Date.UTC(year, month, 1),
        end: Date.UTC(year, month + 1, 1),
      });
    }
  } else {
    const firstYear = new Date(range.start).getUTCFullYear();
    const lastYear = new Date(range.end).getUTCFullYear();
    for (let year = firstYear; year <= lastYear; year++) {
      if ((year - firstYear) % 2 === 1) {
        bands.push({
          start: Date.UTC(year, 0, 1),
          end: Date.UTC(year + 1, 0, 1),
        });
      }
    }
  }

  return bands
    .map((band) => ({
      start: Math.max(band.start, range.start),
      end: Math.min(band.end, range.end),
    }))
    .filter((band) => band.end > band.start);
}

export interface GasUseSummary {
  // How many dives the figures below are drawn from.
  dives: number;
  average: number;
  // Lowest RMV in the period. Lower is better, so this is the best dive, not an
  // outlier to be explained away.
  best: number;
  // Change in average against the previous period *with dives*, as a percentage
  // of that period's average - negative being an improvement. Null when there
  // is nothing to compare against: the "all" scope, or the earliest period.
  changePercent: number | null;
  // What that previous period is called, for the label that carries the number.
  // Null exactly when `changePercent` is.
  previousLabel: string | null;
}

// The figures above the chart: what this period averaged, the best dive in it,
// and whether that average is going the right way.
//
// The chart shows the shape; this answers "am I improving", which is the
// question the card exists for and the one a scatter of dots is worst at. It
// compares against the previous period *containing dives* rather than the
// previous calendar one, for the same reason the arrows step that way (see
// `stepPeriod`): diving happens in bursts, and "vs last month" is meaningless
// when last month was the off-season.
//
// Returns null when the period holds no dives, which the "all" scope can only
// hit on an empty series.
export function summarizeGasUse(
  times: number[],
  rmvs: number[],
  scope: ChartScope,
  anchor: number,
): GasUseSummary | null {
  const inPeriod = (range: { start: number; end: number }) =>
    rmvs.filter(
      (_, index) => times[index] >= range.start && times[index] < range.end,
    );

  const current = scope === "all" ? rmvs : inPeriod(periodRange(anchor, scope));

  if (current.length === 0) return null;

  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  const average = mean(current);
  const summary: GasUseSummary = {
    dives: current.length,
    average,
    best: Math.min(...current),
    changePercent: null,
    previousLabel: null,
  };

  if (scope === "all") return summary;

  const previousAnchor = stepPeriod(anchor, scope, -1, times);
  if (previousAnchor === null) return summary;

  const previousRange = periodRange(previousAnchor, scope);
  const previous = inPeriod(previousRange);
  // `stepPeriod` returned a dive's own timestamp, so the period it sits in has
  // at least that one dive and this cannot divide by zero.
  const previousAverage = mean(previous);

  return {
    ...summary,
    changePercent: ((average - previousAverage) / previousAverage) * 100,
    previousLabel: periodLabel(previousRange.start, scope),
  };
}

// How long a break in diving has to be before the trend line stops being drawn
// across it. Two months is comfortably longer than the gap between dives on a
// trip, or between trips in an active season, and comfortably shorter than an
// off-season.
export const TREND_GAP_DAYS = 60;

// Split a chronological series into runs of points close enough together that a
// line joining them means something, as arrays of indices into the original.
//
// Without this, a diver who logs a week in April and a week in October gets a
// long flat segment spanning the six months between - which reads as "my
// consumption was steady all summer" when the truth is "there is no data here".
// The trailing mean itself deliberately still averages across the gap: your gas
// consumption doesn't reset because you took a winter off. It's only the drawn
// connector that's a lie.
export function segmentByGap(times: number[], gapDays: number): number[][] {
  if (times.length === 0) return [];

  const gapMs = gapDays * 24 * 60 * 60 * 1000;
  const segments: number[][] = [[0]];

  for (let index = 1; index < times.length; index++) {
    if (times[index] - times[index - 1] > gapMs) {
      segments.push([index]);
    } else {
      segments[segments.length - 1].push(index);
    }
  }

  return segments;
}

// Why a dive has no `gas_use`, phrased for the user, or `null` when there's
// nothing worth saying (the figure is present, or the dive logs no tank at all
// and so was never a candidate).
//
// The API returns `gas_use: null` for every un-derivable dive without saying
// why - correctly, since the reasons are a UI concern and the conditions are
// all plainly visible in the dive itself. This is the counterpart that turns
// that silence into something actionable: a diver who filled in pressures and
// still sees no number needs to know it's the missing average depth, not a bug.
// Deliberate mirror of the API's `compute_gas_use()` guard clauses - if that
// function's conditions change, this list has to change with it (one
// `grep gas_use` finds the pair).
//
// Only meaningful on a dive from the *detail* endpoint: the list response
// carries neither `mixtures` nor `gas_use`, so every dive in it would look
// un-derivable. Guarded rather than assumed, since both fields are typed as
// present on the shared `Dive` interface.
export function gasUseUnavailableReason(dive: Dive): string | null {
  if (dive.gas_use) return null;

  const mixtures = dive.mixtures ?? [];
  if (mixtures.length === 0) return null;

  if (mixtures.length > 1) {
    // Not a gap in the data but a gap in the model: a dive doesn't record which
    // tank was breathed when, so a staged deco bottle can't be told apart from
    // a sidemount pair breathed throughout. Worth naming as a limitation rather
    // than asking the diver to add something.
    return "Gas consumption isn't calculated for multi-tank dives yet - a dive doesn't record which tank was breathed when.";
  }

  const [mixture] = mixtures;
  const missingDepth = dive.avg_depth == null || dive.avg_depth <= 0;
  const missingPressures =
    mixture.start_pressure == null || mixture.end_pressure == null;

  if (missingDepth && missingPressures) {
    return "Add an average depth and this tank's start and end pressure to see your gas consumption.";
  }
  if (missingDepth) {
    // Specifically not max depth: a dive spends a moment at its deepest point,
    // so using it would understate consumption badly.
    return "Add an average depth to see your gas consumption.";
  }
  if (missingPressures) {
    return "Add this tank's start and end pressure to see your gas consumption.";
  }

  // Both pressures recorded but no drop between them. The database already
  // rejects an end pressure above the start, so this is the equal case: a tank
  // that was carried but never breathed, or a typo.
  return "This tank's start and end pressure are the same, so it records no gas used.";
}
