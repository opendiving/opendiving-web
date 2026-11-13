"use client";

import { useMemo } from "react";
import { Activity, Info, Minus, TrendingDown, TrendingUp } from "lucide-react";
import {
  CARD_TITLE_ROW,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartPeriodControls } from "@/components/dives/chart-period-controls";
import { ChartSkeleton } from "@/components/dives/chart-skeleton";
import { ChartStat, ChartStatRow } from "@/components/dives/chart-stat";
import { GasUseChart } from "@/components/dives/gas-use-chart";
import { diveStatsAPI, DiveGasUsePoint } from "@/lib/api/dive-stats";
import { type GasUseSummary, summarizeGasUse } from "@/lib/dive-gas";
import { GAS_USE_VIEW_KEY } from "@/lib/chart-period-view";
import { diveWallClockTime } from "@/lib/date-time";
import { cn } from "@/lib/utils";
import {
  type ChartPeriodSource,
  useChartPeriodView,
} from "@/hooks/useChartPeriodView";
import { useUnits } from "@/hooks/useUnits";
import { displayNumber, unitLabel, type UnitSelection } from "@/lib/units";

const GAS_USE_SOURCE: ChartPeriodSource<DiveGasUsePoint> = {
  load: () => diveStatsAPI.getGasUseHistory(),
  failure: "Failed to fetch gas use history:",
  // The chart plots dives, so the anchor is one of their own times rather than
  // an arbitrary date.
  anchors: (points) =>
    points.map((point) => diveWallClockTime(point.start_time)),
  storageKey: GAS_USE_VIEW_KEY,
  defaultScope: "year",
};

// The Home page's gas-consumption trend.
//
// This renders even with nothing to plot. An empty service-due list means nothing
// needs attention, which is genuinely nothing to say,
// whereas an empty series here means the dives are missing pressures or an
// average depth - something the diver can act on, and won't discover otherwise.
// `GasUseChart` owns that message, since it's the component that knows two
// points are the minimum.
export function GasUseCard() {
  const { preferences: units } = useUnits();
  const view = useChartPeriodView(GAS_USE_SOURCE);
  const { points, times, scope, anchor } = view;

  // The figures above the chart. Same threshold as the chart's own: with one
  // dive there is no trend to describe, and a "Median" over a single dive
  // sitting above "log at least two dives" would be a contradiction.
  const summary = useMemo(
    () =>
      points && points.length >= 2
        ? summarizeGasUse(
            times,
            points.map((point) => point.gas_use.rmv),
            scope,
            anchor,
          )
        : null,
    [points, times, scope, anchor],
  );

  return (
    <Card>
      <CardHeader>
        <div className={cn(CARD_TITLE_ROW, "@container")}>
          <CardTitle
            as="h2"
            className="flex min-w-0 grow basis-0 items-center gap-2"
          >
            <Activity className="h-5 w-5" />
            Gas Consumption
          </CardTitle>
          <ChartPeriodControls name="Gas consumption" view={view} />
        </div>
      </CardHeader>
      <CardContent>
        {points === null ? (
          <ChartSkeleton stats={3} legend />
        ) : (
          <>
            {summary && <GasUseSummaryRow summary={summary} units={units} />}
            <GasUseChart points={points} scope={scope} anchor={anchor} />
          </>
        )}
        {/* "Surface-equivalent" is carrying the S of SAC here. The title
            deliberately doesn't: "air" is wrong the moment you breathe nitrox or
            trimix, and the whole data model already says gas (`gas_use`,
            `dive-gas.ts`). The normalisation belongs in the sentence that has
            room to state it.

            The trend is not named here: the legend already labels it, with
            the bin this sentence could not state (it varies by scope - see
            `binUnit`). */}
        <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Surface-equivalent gas volume breathed per minute (RMV). Lower is
          better.
        </p>
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
  units: UnitSelection;
}) {
  return (
    <ChartStatRow className="mb-5">
      <ChartStat label="Median" detail={<Change summary={summary} />}>
        <Figure value={summary.median} units={units} />
      </ChartStat>
      <ChartStat label="Best dive">
        <Figure value={summary.best} units={units} />
      </ChartStat>
      <ChartStat label="Dives">
        <span className="text-base font-semibold tabular-nums">
          {summary.dives}
        </span>
      </ChartStat>
    </ChartStatRow>
  );
}

// One decimal in metric. The API returns two, which is more resolution than a
// figure derived from a hand-read pressure gauge honestly has - and these are
// medians over a whole period, where the second decimal is noise about noise.
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
function Figure({ value, units }: { value: number; units: UnitSelection }) {
  return (
    <>
      <span className="text-base font-semibold tabular-nums">
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
// candidates are both already spoken for on this card - coral is the bins and
// teal is a dive - so a green/red pair here would either collide with the
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
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {percent === 0
        ? `level with ${summary.previousLabel}`
        : `${Math.abs(percent)}% vs ${summary.previousLabel}`}
    </div>
  );
}
