import type { Dive } from "@/lib/api/dives";

// How many dives the trend line averages over. A single dive's RMV swings on
// current, cold, workload and task loading, so the raw points are noise around
// a signal; five is roughly a day's diving and is short enough to still bend
// within a single trip.
export const RMV_TREND_WINDOW = 5;

// Trailing mean of the last `window` values (fewer at the start of the series,
// so the line begins at the first point rather than `window` points in - a gap
// at the left edge reads as missing data).
export function rollingMean(values: number[], window: number): number[] {
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - window + 1), index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

// How much of the series the chart shows at once. A career's worth of dots in
// one frame shows the long arc but buries a single trip; a month shows the trip
// but no arc. Both are worth looking at, so it's a switch rather than a choice
// made once here.
export type GasUseScope = "all" | "year" | "month";

export const GAS_USE_SCOPES: GasUseScope[] = ["all", "year", "month"];

export const GAS_USE_SCOPE_LABELS: Record<GasUseScope, string> = {
  all: "All",
  year: "Year",
  month: "Month",
};

// The half-open `[start, end)` bounds of the calendar period containing
// `anchor`.
//
// Everything here reads and builds timestamps in UTC (`Date.UTC`, `getUTC*`)
// because every time fed to it comes from `diveWallClockTime()`, which encodes a
// dive's *own* local time into a UTC-reading instant. Using the local getters
// would re-interpret that through the viewer's timezone and drop a New Year's
// Eve dive into the wrong year depending on where it's being looked at from.
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
export function periodLabel(anchor: number, scope: GasUseScope): string {
  if (scope === "all") return "All time";

  return new Date(anchor).toLocaleDateString("en-US", {
    ...(scope === "month" ? { month: "long" } : {}),
    year: "numeric",
    timeZone: "UTC",
  });
}

export interface GasUsePeriod {
  // The period's start, as a stable identity for it. This, not `anchor`, is what
  // a dropdown option's value has to be: an arbitrary dive's timestamp is not a
  // value the current anchor can be compared against, and a `<Select>` whose
  // value matches no registered item renders an empty trigger (see the
  // `VolumeCombobox` "NaN L" note above).
  start: number;
  // A real dive's timestamp inside the period, for use as the chart's anchor.
  anchor: number;
}

// Every calendar period that actually contains dives, oldest first - the options
// a period dropdown offers.
//
// Each carries a real dive's timestamp rather than just the period's start, so
// picking one preserves the invariant that the anchor is always a dive. Without
// that, choosing "2025" and then switching to Month would land on January 2025,
// which may well be empty.
export function availablePeriods(
  times: number[],
  scope: "year" | "month",
): GasUsePeriod[] {
  const byPeriod = new Map<number, number>();

  for (const time of times) {
    // `times` is chronological and later writes win, so each period ends up
    // represented by its most recent dive - the same most-recent bias the chart
    // opens with.
    byPeriod.set(periodRange(time, scope).start, time);
  }

  return [...byPeriod].map(([start, anchor]) => ({ start, anchor }));
}

// The anchor for the nearest period in `direction` that actually contains a
// dive, or `null` when there is none - which is what disables the button.
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
// The trailing mean itself deliberately still averages across the gap: your air
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

// A rounded axis domain covering `values`, as `{ min, max, step }`.
//
// Deliberately not zero-based: RMV clusters in a narrow band (most divers live
// between 10 and 25 L/min), and anchoring the axis at 0 squashes a career's
// worth of real variation into the top third of the chart. The axis is labeled,
// so there's no misreading it.
export function niceDomain(
  values: number[],
  targetTicks = 5,
): { min: number; max: number; step: number } {
  if (values.length === 0) return { min: 0, max: 1, step: 1 };

  const lowest = Math.min(...values);
  const highest = Math.max(...values);

  // One dive, or a freakishly consistent diver: a zero-height range would make
  // every scaled coordinate NaN, so give it an arbitrary band to sit in.
  if (highest === lowest) {
    return { min: lowest - 1, max: lowest + 1, step: 1 };
  }

  const rawStep = (highest - lowest) / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  // 2.5 is in here (it isn't in the textbook 1/2/5/10 progression) because
  // without it a 5-to-26 L/min spread - an entirely typical one - falls through
  // to a step of 10 and gets three gridlines for the whole chart.
  const niceStep = [1, 2, 2.5, 5, 10].find((candidate) => normalized <= candidate) ?? 10;
  const step = niceStep * magnitude;

  return {
    min: Math.floor(lowest / step) * step,
    max: Math.ceil(highest / step) * step,
    step,
  };
}

// The gridline values for a domain, inclusive of both ends. Built by counting
// steps rather than by accumulating `+= step`, which drifts on fractional steps
// (0.1 + 0.2 territory) and produces labels like "12.499999999999998".
export function axisTicks({
  min,
  max,
  step,
}: {
  min: number;
  max: number;
  step: number;
}): number[] {
  const count = Math.round((max - min) / step);
  return Array.from({ length: count + 1 }, (_, index) =>
    Number((min + index * step).toFixed(10)),
  );
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
    return "Air consumption isn't calculated for multi-tank dives yet - a dive doesn't record which tank was breathed when.";
  }

  const [mixture] = mixtures;
  const missingDepth = dive.avg_depth == null || dive.avg_depth <= 0;
  const missingPressures =
    mixture.start_pressure == null || mixture.end_pressure == null;

  if (missingDepth && missingPressures) {
    return "Add an average depth and this tank's start and end pressure to see your air consumption.";
  }
  if (missingDepth) {
    // Specifically not max depth: a dive spends a moment at its deepest point,
    // so using it would understate consumption badly.
    return "Add an average depth to see your air consumption.";
  }
  if (missingPressures) {
    return "Add this tank's start and end pressure to see your air consumption.";
  }

  // Both pressures recorded but no drop between them. The database already
  // rejects an end pressure above the start, so this is the equal case: a tank
  // that was carried but never breathed, or a typo.
  return "This tank's start and end pressure are the same, so it records no gas used.";
}
