"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChartSkeleton } from "@/components/dives/chart-skeleton";
import { ChartStat } from "@/components/dives/chart-stat";
import { GasUseChart } from "@/components/dives/gas-use-chart";
import { diveStatsAPI, DiveGasUsePoint } from "@/lib/api/dive-stats";
import { type GasUseSummary, summarizeGasUse } from "@/lib/dive-gas";
import {
  CHART_SCOPES,
  CHART_SCOPE_LABELS,
  type ChartScope,
  availablePeriods,
  periodLabel,
  periodRange,
  resolveAnchor,
  stepPeriod,
} from "@/lib/chart-period";
import {
  parseGasUseView,
  readStoredGasUseView,
  writeGasUseView,
} from "@/lib/gas-use-view";
import { subscribeToNothing } from "@/lib/chart-series-view";
import { diveWallClockTime } from "@/lib/date-time";
import { cn } from "@/lib/utils";
import { useUnits } from "@/hooks/useUnits";
import { displayNumber, unitLabel, type UnitSystem } from "@/lib/units";

// The dashboard's gas-consumption trend.
//
// Unlike `ServiceDueCard`, this renders even with nothing to plot: an empty
// service list means nothing needs attention, which is genuinely nothing to say,
// whereas an empty series here means the dives are missing pressures or an
// average depth - something the diver can act on, and won't discover otherwise.
// `GasUseChart` owns that message, since it's the component that knows two
// points are the minimum.
export function GasUseCard() {
  const units = useUnits();
  const [points, setPoints] = useState<DiveGasUsePoint[] | null>(null);
  // Both of these hold *this visit's* choice, and both are null until the diver
  // makes one - which is what leaves room for the remembered view underneath.
  // The anchor is a timestamp inside the visible period, and always one of the
  // dives' own times rather than an arbitrary date: that's what makes switching
  // scope land somewhere useful (the month *containing* the dive you were
  // looking at) instead of on an empty period.
  const [chosenScope, setChosenScope] = useState<ChartScope | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);

  // Names the period dropdown without talking over what it says. `aria-label`
  // here would *replace* the trigger's accessible name, and part of that name is
  // its own value - "September 2025" - which is the one thing a diver needs read
  // back. This id leads an `aria-labelledby` that ends with the trigger's own, so
  // the chart's name is prefixed onto the value rather than swapped for it. It
  // was an `aria-describedby` until a description turned out never to reach the
  // name at all; the reasoning is beside the attribute, below.
  const periodHintId = useId();
  // The trigger names itself as well as being named - see the `aria-labelledby`
  // below.
  const periodTriggerId = useId();

  // The view remembered from last time.
  //
  // Through `useSyncExternalStore` rather than a `useState` + effect pair, which
  // is what this wants to be and can't: `localStorage` doesn't exist on the
  // server, so a first client render that read it would disagree with the HTML
  // Next rendered and be a hydration mismatch. The three arguments are exactly
  // that problem's shape - a server snapshot of `null` to hydrate against, a
  // client snapshot read straight from storage, and no subscription (see
  // `subscribeToNothing`). React re-renders with the client value immediately
  // after hydrating, under the spinner the card is already showing.
  //
  // The snapshot is the raw string because `useSyncExternalStore` compares
  // snapshots by identity; parsing it here, once per distinct string, is what
  // keeps that comparison meaningful.
  const stored = useSyncExternalStore(
    subscribeToNothing,
    readStoredGasUseView,
    () => null,
  );
  const remembered = useMemo(() => parseGasUseView(stored), [stored]);

  const scope = chosenScope ?? remembered?.scope ?? "year";

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setPoints(await diveStatsAPI.getGasUseHistory());
      } catch (error) {
        console.error("Failed to fetch gas use history:", error);
        // An empty series renders the same prompt as "no qualifying dives",
        // which is a better failure than a card stuck spinning forever.
        setPoints([]);
      }
    };

    fetchHistory();
  }, []);

  const times = useMemo(
    () => (points ?? []).map((point) => diveWallClockTime(point.start_time)),
    [points],
  );

  // The remembered period, checked against the dives that exist now - see
  // `resolveAnchor`. Null until the series arrives, which is why the fallback
  // below still has to be there.
  const rememberedAnchor = useMemo(
    () => resolveAnchor(remembered?.anchor ?? null, scope, times),
    [remembered, scope, times],
  );

  // Three sources, most specific first: whatever the diver clicked in this
  // visit, then whatever they were reading last visit, then the most recent
  // dive - not the oldest, since the interesting question is how you're diving
  // now and the older periods are one click back.
  const activeAnchor =
    anchor ?? rememberedAnchor ?? times[times.length - 1] ?? 0;

  // Remembered for next time. Held back until the series is in: `times` is what
  // `rememberedAnchor` resolves against, so writing before it arrives would
  // persist a null over the very period we're about to restore. That guard also
  // covers the failed-fetch path, which sets an empty series - a request that
  // didn't come back should not erase where you were.
  useEffect(() => {
    if (times.length === 0) return;

    // The *chosen* anchor, never `activeAnchor`. Falling back to the most
    // recent dive is a default, not a preference, and persisting it would pin
    // the card to today's newest dive forever - so a diver who never touched
    // the period control would stop following their own new dives.
    writeGasUseView({ scope, anchor: anchor ?? rememberedAnchor });
  }, [times, scope, anchor, rememberedAnchor]);

  // The figures above the chart. Same threshold as the chart's own: with one
  // dive there is no trend to describe, and an "Average" over a single dive
  // sitting above "log at least two dives" would be a contradiction.
  const summary = useMemo(
    () =>
      points && points.length >= 2
        ? summarizeGasUse(
            times,
            points.map((point) => point.gas_use.rmv),
            scope,
            activeAnchor,
          )
        : null,
    [points, times, scope, activeAnchor],
  );

  const steppable = scope === "all" ? null : scope;
  const previous = steppable
    ? stepPeriod(activeAnchor, steppable, -1, times)
    : null;
  const next = steppable ? stepPeriod(activeAnchor, steppable, 1, times) : null;
  const periods = useMemo(
    () => (steppable ? availablePeriods(times, steppable) : []),
    [times, steppable],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* `CardHeader`'s own `space-y-1.5` only reaches its direct children,
              and the controls to the right put a wrapper between it and the
              title - so the pair has to carry the gap itself. */}
          <div className="space-y-1.5">
            <CardTitle as="h2" className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Gas Consumption
            </CardTitle>
            <CardDescription>
              {/* "Surface-equivalent" is carrying the S of SAC here. The title
                  deliberately doesn't: "air" is wrong the moment you breathe
                  nitrox or trimix, and the whole data model already says gas
                  (`gas_use`, `dive-gas.ts`). The normalisation belongs in the
                  sentence that has room to state it.

                  The rolling trend used to be named here too, and isn't: the
                  legend already labels it, with the window length that this
                  sentence couldn't state (it varies by scope - see
                  `trendWindow`). Length is load-bearing beyond the redundancy.
                  The header row wraps on max-content, not on what the text
                  could shrink to, so every word here is width the period
                  controls don't get - and past ~515px they drop to a row of
                  their own at 1024. */}
              Surface-equivalent gas breathed per minute (RMV). Lower is better.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {scope !== "all" && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={previous === null}
                  onClick={() => setAnchor(previous)}
                  aria-label="Gas consumption: previous period with dives"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {/* The label is also the jump-to control - stepping one period
                    at a time is fine for "the trip before this one", but useless
                    for reaching a specific year several seasons back.

                    Its value is the *period's* start, never `activeAnchor`
                    itself: the anchor is whichever dive you happened to land on,
                    which usually matches no option, and a `Select` whose value
                    has no registered item renders an empty trigger. Fixed width
                    so the chart doesn't shift sideways between "May 2026" and
                    "September 2026". */}
                <span id={periodHintId} className="sr-only">
                  Gas consumption period
                </span>
                <Select
                  value={String(periodRange(activeAnchor, scope).start)}
                  onValueChange={(value) => {
                    const picked = periods.find(
                      (period) => String(period.start) === value,
                    );
                    if (picked) setAnchor(picked.anchor);
                  }}
                >
                  {/* `aria-labelledby`, not the `aria-describedby` this was: a
                      description does not contribute to the accessible name, so
                      the trigger's only name was whatever `SelectValue` had
                      rendered - and on the period with no registered item (the
                      case the note above is about) that is nothing at all, which
                      axe reports as `button-name`, critical.

                      Both ids, in this order, so the name is "Gas consumption
                      period" *followed by* the period showing - the second is the
                      trigger's own text, which naming it by anything else would
                      have replaced rather than prefixed. */}
                  <SelectTrigger
                    id={periodTriggerId}
                    aria-labelledby={`${periodHintId} ${periodTriggerId}`}
                    className="h-8 w-40 px-2 text-sm font-medium"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((period) => (
                      <SelectItem
                        key={period.start}
                        value={String(period.start)}
                      >
                        {periodLabel(period.start, scope)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={next === null}
                  onClick={() => setAnchor(next)}
                  aria-label="Gas consumption: next period with dives"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Every control in this row names its own card, because the two
                cards draw the same row and `Card` is a plain `div` - so nothing
                scopes them to each other. Read in place the heading above is all
                the context you need, but a screen reader's controls list is flat
                names and nothing else, and four arrows reading "Previous period
                with dives" in it are four coin flips. The card name leads rather
                than trails so the list groups by chart when it is scanned or
                sorted. Same ambiguity `screenshots.mjs` hit from the automation
                side, where the fix was to scope by the card's own heading, which
                is exactly the context a controls list drops. (Named by role
                rather than by level, there and here: this title has been an
                `<h3>` and is now an `<h2>`, and the scoping never cared.) */}
            {/* A segmented control built from plain buttons - the app has no
                tabs/toggle-group primitive, and three buttons in a bordered row
                is the whole of it. */}
            <div
              className="flex items-center rounded-md border p-0.5"
              role="group"
              aria-label="Gas consumption: time range"
            >
              {CHART_SCOPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setChosenScope(option)}
                  aria-pressed={scope === option}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    scope === option
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {CHART_SCOPE_LABELS[option]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {points === null ? (
          <ChartSkeleton stats={3} legend />
        ) : (
          <>
            {summary && <GasUseSummaryRow summary={summary} units={units} />}
            <GasUseChart points={points} scope={scope} anchor={activeAnchor} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// The headline figures for the period on screen.
//
// The chart shows the shape; this answers "am I improving", which is the
// question the card exists for and the one a scatter of dots is worst at
// answering at a glance.
function GasUseSummaryRow({
  summary,
  units,
}: {
  summary: GasUseSummary;
  units: UnitSystem;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-8 gap-y-3">
      <ChartStat label="Average">
        <Figure value={summary.average} units={units} />
        <Change summary={summary} />
      </ChartStat>
      <ChartStat label="Best dive">
        <Figure value={summary.best} units={units} />
      </ChartStat>
      <ChartStat label="Dives">
        <span className="text-xl font-semibold tabular-nums">
          {summary.dives}
        </span>
      </ChartStat>
    </div>
  );
}

// One decimal in metric. The API returns two, which is more resolution than a
// figure derived from a hand-read pressure gauge honestly has - and these are
// averages over a whole period, where the second decimal is noise about noise.
// (The hover card on the chart still shows a single dive's own two, as it always
// has.)
//
// Imperial keeps both of its own, and that is not an inconsistency: a cubic foot
// is 28 litres, so 0.64 cuft/min is already coarser than the 18.2 L/min this
// prints beside it. Rounding it further would merge rates a diver can tell apart.
//
// Value and unit are drawn at different sizes, so this builds the string from the
// two halves `lib/units.ts` exports rather than calling `formatRmv` - the numbers
// and the label are the same either way.
function Figure({ value, units }: { value: number; units: UnitSystem }) {
  return (
    <>
      <span className="text-xl font-semibold tabular-nums">
        {displayNumber(value, "rmv", units, { decimals: 1 })}
      </span>
      <span className="text-sm text-muted-foreground">
        {unitLabel("rmv", units)}
      </span>
    </>
  );
}

// Change against the previous period with dives.
//
// Deliberately uncolored. The app has no good/bad status tokens, and the two
// candidates are both already spoken for on this card - coral is the trend line
// and teal is a dive - so a green/red pair here would either collide with the
// chart's own meanings or have to be invented for one label. The arrow and the
// "vs <period>" text carry it instead, which is also what keeps the direction
// legible to anyone who can't separate the two hues.
function Change({ summary }: { summary: GasUseSummary }) {
  if (summary.changePercent === null) return null;

  // Rounded before it's judged, so a 0.4% drift isn't announced as an
  // improvement by an arrow pointing at a number that reads "0%".
  const percent = Math.round(summary.changePercent);
  const Icon = percent === 0 ? Minus : percent < 0 ? TrendingDown : TrendingUp;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {percent === 0
        ? `level with ${summary.previousLabel}`
        : `${Math.abs(percent)}% vs ${summary.previousLabel}`}
    </span>
  );
}
