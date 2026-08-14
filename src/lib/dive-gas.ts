import type {
  Dive,
  DiveGasUse,
  DiveTankGasUse,
  GasRole,
} from "@/lib/api/dives";
import {
  type ChartScope,
  periodLabel,
  periodRange,
  stepPeriod,
} from "@/lib/chart-period";
import { formatDurationHoursMinutes } from "@/lib/date-time";
import { gasName } from "@/lib/dive-mixtures";

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
// Deliberate mirror of the guard clauses in the API's `compute_gas_use()` *and*
// `compute_multi_tank_gas_use()` - if either function's conditions change, this
// list has to change with it (one `grep gas_use` finds the set).
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
    // Several cylinders now *can* yield figures, from
    // `compute_multi_tank_gas_use`. It gives up for five distinct reasons, and
    // this is the browser's reading of which one applies. In the API's own
    // order:
    //
    // 1. The profile carries no gas-switch attribution at all. Refuses.
    // 2. Two mixtures claim one `gas_number` (or two attribution entries do),
    //    which makes every join ambiguous. Refuses the whole dive rather than
    //    just those two.
    // 3. A cylinder the attribution never names. **Skipped only when its own
    //    pressures show no drop** - the commonest case in the corpus, a deco
    //    bottle with no transmitter. One that demonstrably *was* breathed
    //    refuses the dive: the time it was breathed for is sitting inside some
    //    other tank's stretch, so the surviving figures are wrong rather than
    //    merely partial, and the coverage fraction cannot show it.
    // 4. A cylinder failing the same pressure arithmetic `compute_gas_use`
    //    applies is skipped. If *every* cylinder is skipped, nothing survives
    //    and the dive comes back empty.
    // 5. A tank whose per-tank RMV comes out past `MAX_PLAUSIBLE_RMV` refuses
    //    the dive - case 3's fault arriving by another route, a switch recorded
    //    late rather than not at all.
    //
    // Three of those five (1, the refusing half of 3, and 5) are attribution
    // faults and share one sentence, which is why it must not claim the import
    // has no gas switches: on 3 and 5 it demonstrably does, and the profile
    // chart is drawing their markers ten lines up the same page. It says the
    // switches don't account for every cylinder instead, which is true of all
    // three - including the no-switches case, vacuously.
    //
    // Case 2 gets no sentence: not reachable through this app, since
    // `gas_number` is carried and never edited and a hand-added cylinder has
    // none, so a phrase for it would be untestable wording for a state the UI
    // can't produce. Case 4 is the two sentences below.
    //
    // Before any of that: no profile, no attribution, whatever the diver types.
    // `gas_attribution` is a column *on* `dive_profile`, so a dive without one
    // cannot reach the multi-tank derivation at all - and this is the ordinary
    // case rather than an edge, being 18 of the 19 multi-gas dives in the
    // corpus, every one of them logged by hand. Without this branch they were
    // told their import's gas switches fall short of covering every cylinder,
    // about an import they never made; and the "add your pressures" branch
    // below would have sent the ones missing pressures off to fill in fields
    // that change nothing, to be met with a different refusal.
    //
    // `profile` is on the detail response, and only the detail response - but
    // the `mixtures` guard above has already returned for a list dive, so a
    // missing `profile` here means the dive genuinely has none.
    if (dive.profile == null) {
      return "Gas consumption for a multi-tank dive is worked out from the gas switches in an imported dive-computer file, and this dive doesn't have one.";
    }

    // Attribution is tested next because it is the outer gate: the API reaches
    // the pressure arithmetic only after the attribution exists. The browser
    // can't see that column, so the inference runs backwards - a cylinder whose
    // pressures would have produced a figure, on a dive that produced none,
    // means the attribution is what was missing.
    const breathed = mixtures.filter(
      (mixture) =>
        mixture.start_pressure != null &&
        mixture.end_pressure != null &&
        mixture.start_pressure > mixture.end_pressure,
    );
    if (breathed.length > 0) {
      return "Gas consumption for a multi-tank dive needs an import whose gas switches account for every cylinder on the dive.";
    }

    // Pressures recorded on some cylinder, but no drop on any of them - the
    // multi-cylinder form of the "carried but never breathed" case below.
    // Nothing to add and nothing to divide up, so neither sentence around this
    // one fits.
    const anyPressures = mixtures.some(
      (mixture) =>
        mixture.start_pressure != null && mixture.end_pressure != null,
    );
    if (anyPressures) {
      return "No cylinder on this dive records a drop between its start and end pressure, so there is no gas used to divide up.";
    }

    // Plural, and no mention of average depth: the multi-tank path takes its
    // depth per cylinder from the profile, so `dive.avg_depth` is not one of its
    // inputs and asking for it would send a diver to fill in a field that
    // changes nothing.
    return "Add each cylinder's start and end pressure to see your gas consumption.";
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

// One line of the per-tank consumption table: a cylinder the dive logs, and the
// share of the gas the API attributed to it.
export interface TankGasUseRow {
  // React key. Built from the cylinder's identity rather than its gas number,
  // which is neither unique nor always present.
  key: string;
  // Named exactly as the mixtures card names the same cylinder - its 1-based
  // position, written bare - so the two tables can be read against each other
  // row by row. A tank matching no mixture has no position to state and carries
  // the device's `Gas N` instead.
  label: string;
  // `gasName`'s output, so the badge here and the badge there are the same
  // string - null for a cylinder whose fractions can't be named, and for a tank
  // with no mixture to name it from.
  gas: string | null;
  role: GasRole | null;
  // Whether this cylinder records both pressures. Only consulted when `use` is
  // null, where it separates the two reasons a row can carry no figures - see
  // below - and it is the one of the two the browser can see for itself.
  hasPressures: boolean;
  // Null for a cylinder with no figures. That is a real state worth a row
  // rather than an omission: a pony bottle carried and never breathed belongs
  // in this table saying so, and dropping it would leave the table quietly
  // shorter than the mixtures table above it.
  //
  // **Two server states collapse into this null**, and a caller labelling the
  // row must not name only the first. Either the attribution never mentioned
  // the cylinder - the corpus's deco bottle with no transmitter - or it did,
  // and `_tank_arithmetic` declined it: no pressures, no drop between them, or
  // a degenerate stretch (`seconds <= 0`, `mean_depth_cm <= 0`, which a gas
  // switched to at the surface at the end of a dive really produces). In that
  // second case the coverage note below the table reports the missing seconds,
  // so a row reading "not attributed" would be contradicted three lines down.
  use: DiveTankGasUse | null;
}

/**
 * The per-cylinder consumption rows for a dive, in the order the dive lists its
 * cylinders, or an empty array when the API attributed nothing per tank.
 *
 * The join is `DiveMixture.gas_number` ↔ `DiveTankGasUse.gas_number`, and it
 * applies the same rule the API does rather than trusting that the API applied
 * it. `compute_multi_tank_gas_use` refuses a whole dive whose mixtures share a
 * gas number, so in practice a duplicate arrives here with `gas_use: null` and
 * this function is never reached - the guard below is belt-and-braces, and
 * deliberately so. It is the cheap half of a pair whose expensive half is a
 * table showing one cylinder's litres twice under a total that counted them
 * once, and the two sides can drift: the form carries `gas_number` untouched
 * today, and the day it doesn't, or the day a response cached before that guard
 * existed is served, this is what stands between a duplicate and a table that
 * visibly doesn't add up.
 *
 * So a gas number naming more than one cylinder names none of them: both rows
 * come back unattributed. **The rule is applied to both sides of the join**, not
 * just the mixtures — two tanks sharing a number leave neither matched, and each
 * lands in a row of its own. An asymmetry here would have been the same bug in
 * mirror image, and a worse one: a lookup keeping the last writer drops the
 * earlier tank from the table while its litres stay inside the total.
 *
 * A tank matching no mixture is appended rather than dropped, for the reason
 * that governs all of the above: its litres are already inside the dive-wide
 * total, so hiding the row would leave a total the visible rows don't add up to.
 * Every tank reaches exactly one row, matched or appended, which is what makes
 * that guarantee checkable.
 */
export function tankGasUseRows(dive: Dive): TankGasUseRow[] {
  const tanks = dive.gas_use?.tanks ?? [];
  if (tanks.length === 0) return [];

  const mixtures = dive.mixtures ?? [];

  const occurrences = new Map<number, number>();
  for (const mixture of mixtures) {
    if (mixture.gas_number == null) continue;
    const number = mixture.gas_number;
    occurrences.set(number, (occurrences.get(number) ?? 0) + 1);
  }

  // The same count on the tank side, and for the same reason. A `Map` keyed by
  // gas number silently keeps the last writer, so two tanks sharing a number
  // would leave the earlier one matched to nothing, skipped by the append loop
  // below - which tests the number, not the tank - and therefore invisible,
  // while its litres stayed inside the dive-wide total. That is the mixture-side
  // failure exactly, arriving from the other end, so it gets the same answer:
  // a number naming two tanks names neither, and both fall through to rows of
  // their own.
  const tankOccurrences = new Map<number, number>();
  for (const tank of tanks) {
    tankOccurrences.set(
      tank.gas_number,
      (tankOccurrences.get(tank.gas_number) ?? 0) + 1,
    );
  }

  const byNumber = new Map<number, DiveTankGasUse>();
  for (const tank of tanks) {
    if (tankOccurrences.get(tank.gas_number) === 1) {
      byNumber.set(tank.gas_number, tank);
    }
  }

  // Tanks, not gas numbers. Identity is what "this tank already has a row"
  // actually means, and keying it by number is what let a duplicate suppress a
  // tank that was never rendered.
  const claimed = new Set<DiveTankGasUse>();
  const rows: TankGasUseRow[] = mixtures.map((mixture, index) => {
    const number = mixture.gas_number;
    const use =
      number != null && occurrences.get(number) === 1
        ? (byNumber.get(number) ?? null)
        : null;
    if (use) claimed.add(use);

    return {
      // Namespaced by which of the two it is: `mixture-${id ?? index}` collides
      // when some mixtures carry ids and others don't (`[{id: 1}, {}]` keys both
      // to `mixture-1`). Saved mixtures always have ids, so this is unreachable
      // today - but "gives every row a distinct key" is a claim a test makes
      // here, and it should be true for the reason it states.
      key:
        mixture.id != null ? `mixture-id-${mixture.id}` : `mixture-at-${index}`,
      // Same label as the mixtures card's first column, down to the 1-based
      // position - which is the cylinder's place in the list, and deliberately
      // not its gas number, since a Suunto Ocean numbers from 0. Bare, because
      // both tables now head this column `#` and carry the word nowhere.
      label: `${index + 1}`,
      gas: gasName(mixture.oxygen, mixture.helium),
      role: mixture.role ?? null,
      hasPressures:
        mixture.start_pressure != null && mixture.end_pressure != null,
      use,
    };
  });

  tanks.forEach((tank, index) => {
    if (claimed.has(tank)) return;
    rows.push({
      // Position in `tanks`, not the gas number, which duplicates share - two
      // tanks labelled gas 1 would otherwise render under one React key.
      key: `tank-${index}`,
      // The device's own label is all there is to call it by. "Gas 3" rather
      // than a bare "3", so it can't be misread as the third row of the mixtures
      // table - the whole point of this row is that it matches none of them.
      // This is why the rows above lost the word and this one keeps it: the
      // distinction was never "tank" versus "gas", it was numbered-by-position
      // versus named-by-the-device, and only one of those needs saying now that
      // the column is headed `#`.
      label: `Gas ${tank.gas_number}`,
      gas: null,
      role: null,
      // No mixture behind this row, so nothing to have recorded pressures. Never
      // read - `use` is set - but it must not claim otherwise.
      hasPressures: false,
      use: tank,
    });
  });

  return rows;
}

// Below this, the unattributed remainder is rounding rather than a gap worth a
// sentence. A minute is also the resolution the note is phrased at, so anything
// shorter would print a range whose two ends read the same.
const UNATTRIBUTED_NOTE_SECONDS = 60;

/**
 * How much of the dive the per-tank figures actually account for, phrased for
 * the diver, or `null` when they account for effectively all of it.
 *
 * Attribution is an inference from the profile, not a recorded fact, and it can
 * leave a remainder: a file that records gas switches but not which cylinder the
 * diver entered the water on has nothing to assign the descent to. Figures
 * covering 38 of 42 minutes are still worth showing - they are right about the
 * 38 - but presenting them as the whole dive would understate every one of them.
 *
 * **The denominator is attributed to the dive computer in so many words**, and
 * has to be. It is the profile's span, which routinely runs longer than the
 * duration the same page prints at the top - a computer keeps sampling after the
 * diver surfaces, by five minutes on dive #493. An unattributed "of the 1h 12min
 * recorded" under a header reading "1h 7min" reads as one of the two being
 * wrong, when both are right about different things.
 */
export function gasAttributionNote(gasUse: DiveGasUse): string | null {
  const attributed = gasUse.attributed_seconds;
  const total = gasUse.duration_seconds;

  if (attributed == null || total == null) return null;
  if (!Number.isFinite(attributed) || !Number.isFinite(total)) return null;
  // A remainder can only be measured against a span. Guards the degenerate
  // profile as well as the impossible over-attribution that would phrase itself
  // as covering more of the dive than the dive contains.
  if (total <= 0 || attributed >= total) return null;

  if (total - attributed < UNATTRIBUTED_NOTE_SECONDS) return null;

  return `These figures cover ${formatDurationHoursMinutes(attributed)} of the ${formatDurationHoursMinutes(total)} the dive computer recorded - the rest couldn't be assigned to a cylinder.`;
}
