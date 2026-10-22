"use client";

import { useMemo } from "react";
import { BarChart3, Minus, TrendingDown, TrendingUp } from "lucide-react";
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
import { DiveActivityChart } from "@/components/dives/dive-activity-chart";
import { diveStatsAPI, DiveActivityPoint } from "@/lib/api/dive-stats";
import {
  type DiveActivitySummary,
  activityBars,
  activityDays,
  barCeiling,
  summarizeActivity,
} from "@/lib/dive-activity";
import type { ChartScope } from "@/lib/chart-period";
import { DIVE_ACTIVITY_VIEW_KEY } from "@/lib/chart-period-view";
import {
  type ChartPeriodSource,
  useChartPeriodView,
} from "@/hooks/useChartPeriodView";
import { cn } from "@/lib/utils";

const ACTIVITY_SOURCE: ChartPeriodSource<DiveActivityPoint> = {
  load: () => diveStatsAPI.getDiveActivity(),
  failure: "Failed to fetch dive activity:",
  // A bar is a calendar bucket, so the anchor is the start of a day that has
  // diving in it.
  anchors: activityDays,
  storageKey: DIVE_ACTIVITY_VIEW_KEY,
  // Opens on the whole career, not on a year of it - the opposite default to the
  // gas card's, and deliberate. "How has my diving gone" is the question this
  // card exists for, and a bar per year answers it at any career length, where a
  // dot per dive over the same span is a smear. A single season is one click in.
  defaultScope: "all",
};

// The Home page's how-much-am-I-diving card, and the counterpart to
// `GasUseCard`: that one is about the quality of the diving, this one about the
// quantity. They share their shape deliberately - the same header, the same stat
// row, the same period controls in the same corner, the same All/Year/Month
// scopes over the same shared `chart-period.ts` - because two charts on one page
// that work differently cost more to read than either does alone.
//
// Where they differ is what a mark *is*. The gas chart plots dives, so its anchor
// is one of their timestamps; here a bar is a calendar bucket, so the anchor is
// the start of a day that has diving in it. Everything downstream of that -
// stepping to the next period with dives, the dropdown of periods worth offering,
// restoring the remembered one - is `useChartPeriodView`, shared by both cards.
export function DiveActivityCard() {
  const view = useChartPeriodView(ACTIVITY_SOURCE);
  const { points, scope, anchor } = view;

  const bars = useMemo(
    () => activityBars(points ?? [], scope, anchor),
    [points, scope, anchor],
  );
  const ceiling = useMemo(
    () => barCeiling(points ?? [], scope),
    [points, scope],
  );
  const summary = useMemo(
    () => summarizeActivity(points ?? [], scope, anchor),
    [points, scope, anchor],
  );

  return (
    <Card>
      <CardHeader>
        <div className={cn(CARD_TITLE_ROW, "@container")}>
          <CardTitle
            as="h2"
            className="flex min-w-0 grow basis-0 items-center gap-2"
          >
            <BarChart3 className="h-5 w-5" />
            Dive Activity
          </CardTitle>
          <ChartPeriodControls name="Dive activity" view={view} />
        </div>
      </CardHeader>
      <CardContent>
        {points === null ? (
          <ChartSkeleton stats={2} />
        ) : (
          <>
            {summary && (
              <DiveActivitySummaryRow summary={summary} scope={scope} />
            )}
            <DiveActivityChart bars={bars} ceiling={ceiling} scope={scope} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// What one bar counts, for the stat that names the fullest of them.
const BUSIEST_LABELS: Record<ChartScope, string> = {
  all: "Busiest year",
  year: "Busiest month",
  month: "Busiest day",
};

// The headline figures for what's on screen. The bars show the shape; these
// answer "how much, and is it more than before", which a row of columns is
// worst at answering precisely.
function DiveActivitySummaryRow({
  summary,
  scope,
}: {
  summary: DiveActivitySummary;
  scope: ChartScope;
}) {
  return (
    <ChartStatRow className="mb-5 items-end">
      <ChartStat label="Dives" detail={<Change summary={summary} />}>
        <span className="text-base font-semibold tabular-nums">
          {summary.dives}
        </span>
      </ChartStat>
      <ChartStat label={BUSIEST_LABELS[scope]}>
        <span className="text-base font-semibold">{summary.busiestLabel}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {summary.busiestDives} {summary.busiestDives === 1 ? "dive" : "dives"}
        </span>
      </ChartStat>
    </ChartStatRow>
  );
}

// Change against the previous period with diving.
//
// Deliberately uncolored, the same call the gas card's `Change` makes and for
// the same reason: the app has no good/bad status tokens, and teal is already
// spoken for as "a dive" on the plot below. It also isn't obviously a good or
// bad thing - a light year can be a house move rather than a slump - so the
// arrow and the "vs 2025" carry the direction and nothing editorializes about it.
function Change({ summary }: { summary: DiveActivitySummary }) {
  if (summary.change === null) return null;

  const Icon =
    summary.change === 0
      ? Minus
      : summary.change < 0
        ? TrendingDown
        : TrendingUp;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {summary.change === 0
        ? `level with ${summary.previousLabel}`
        : `${summary.change > 0 ? "+" : "−"}${Math.abs(summary.change)} vs ${summary.previousLabel}`}
    </span>
  );
}
