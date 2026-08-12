"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  BarChart3,
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
import { SectionSpinner } from "@/components/ui/section-spinner";
import { ChartStat } from "@/components/dives/chart-stat";
import { DiveActivityChart } from "@/components/dives/dive-activity-chart";
import { diveStatsAPI, DiveActivityPoint } from "@/lib/api/dive-stats";
import {
  DIVE_ACTIVITY_SCOPES,
  DIVE_ACTIVITY_SCOPE_LABELS,
  type DiveActivityScope,
  type DiveActivitySummary,
  activityBars,
  barCeiling,
  divingYears,
  stepYear,
  summarizeActivity,
} from "@/lib/dive-activity";
import {
  parseDiveActivityView,
  readStoredDiveActivityView,
  resolveYear,
  writeDiveActivityView,
} from "@/lib/dive-activity-view";
import { subscribeToNothing } from "@/lib/chart-series-view";
import { cn } from "@/lib/utils";

// The dashboard's how-much-am-I-diving card, and the counterpart to
// `GasUseCard`: that one is about the quality of the diving, this one about the
// quantity. They share their shape deliberately - the same header, the same
// stat row, the same period controls in the same corner - because two charts on
// one page that work differently cost more to read than either does alone.
//
// Where they differ is what a period *is*. The gas chart plots dives, so its
// period is anchored to one of them; here a bar is a calendar bucket and the
// period is a plain year. That's why this card carries a year rather than an
// anchor, and why the "All" scope has no counterpart: the year scope already
// shows every year there is.
export function DiveActivityCard() {
  const [points, setPoints] = useState<DiveActivityPoint[] | null>(null);
  // This visit's choices, both null until the diver makes one - which is what
  // leaves room for the remembered view underneath.
  const [chosenScope, setChosenScope] = useState<DiveActivityScope | null>(
    null,
  );
  const [chosenYear, setChosenYear] = useState<number | null>(null);

  // The view remembered from last time, through `useSyncExternalStore` rather
  // than a `useState` + effect pair for the reason `GasUseCard` documents at
  // length: `localStorage` doesn't exist on the server, so a first client render
  // that read it would disagree with the HTML Next rendered and be a hydration
  // mismatch. The snapshot is the raw string because the store compares
  // snapshots by identity.
  const stored = useSyncExternalStore(
    subscribeToNothing,
    readStoredDiveActivityView,
    () => null,
  );
  const remembered = useMemo(() => parseDiveActivityView(stored), [stored]);

  // Opens on the years, not the months: "how has my diving gone" is the question
  // the card exists for, and a single year is one click in.
  const scope = chosenScope ?? remembered?.scope ?? "year";

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setPoints(await diveStatsAPI.getDiveActivity());
      } catch (error) {
        console.error("Failed to fetch dive activity:", error);
        // An empty series renders the same prompt as an empty logbook, which is
        // a better failure than a card stuck spinning forever.
        setPoints([]);
      }
    };

    fetchActivity();
  }, []);

  const years = useMemo(() => divingYears(points ?? []), [points]);

  // The remembered year, checked against the logbook as it exists now - see
  // `resolveYear`. Null until the series arrives, which is why the fallback
  // below still has to be there.
  const rememberedYear = useMemo(
    () => resolveYear(remembered?.year ?? null, years),
    [remembered, years],
  );

  // Three sources, most specific first: this visit's pick, then last visit's,
  // then the most recent year with diving - not the first, since the interesting
  // question is how this season is going and the older years are one click back.
  //
  // The `0` is unreachable except on an empty logbook, where the chart renders
  // its prompt instead of a grid of twelve empty months.
  const activeYear =
    chosenYear ?? rememberedYear ?? years[years.length - 1] ?? 0;

  // Remembered for next time. Held back until the series is in: `years` is what
  // `rememberedYear` resolves against, so writing before it arrives would
  // persist a null over the very year we're about to restore. That guard also
  // covers the failed-fetch path, which sets an empty series - a request that
  // didn't come back should not erase where you were.
  useEffect(() => {
    if (years.length === 0) return;

    // The *chosen* year, never `activeYear`. Falling back to the most recent one
    // is a default, not a preference, and persisting it would pin the card to
    // this year forever - so a diver who never touched the control would stop
    // following their own diving into next season.
    writeDiveActivityView({ scope, year: chosenYear ?? rememberedYear });
  }, [years, scope, chosenYear, rememberedYear]);

  const bars = useMemo(
    () => activityBars(points ?? [], scope, activeYear),
    [points, scope, activeYear],
  );
  const ceiling = useMemo(
    () => barCeiling(points ?? [], scope),
    [points, scope],
  );
  const summary = useMemo(
    () => summarizeActivity(points ?? [], scope, activeYear),
    [points, scope, activeYear],
  );

  const previous = stepYear(activeYear, -1, years);
  const next = stepYear(activeYear, 1, years);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* `CardHeader`'s own `space-y-1.5` only reaches its direct children,
              and the controls to the right put a wrapper between it and the
              title - so the pair has to carry the gap itself. */}
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Dive Activity
            </CardTitle>
            <CardDescription>
              {/* Kept to one line's worth. The header is a wrapping flex row
                  with the period controls on the far side of it, and a
                  description any longer than the gas card's pushes them onto a
                  second line - so the two cards' controls stop lining up down
                  the page. What went to make room: a note that the counting
                  happens in each dive's own local time, which is a promise the
                  app keeps everywhere and states nowhere else. */}
              How many dives you logged, year by year or month by month.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Only the month scope has a year to navigate. The year scope
                already shows every year there is, so arrows on it would have
                nowhere to go. */}
            {scope === "month" && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={previous === null}
                  onClick={() => setChosenYear(previous)}
                  aria-label="Previous year with dives"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {/* The label is also the jump-to control - stepping a year at a
                    time is fine for "the season before this one" and useless for
                    reaching one several seasons back. Fixed width so the chart
                    doesn't shift as the label changes. */}
                <Select
                  value={String(activeYear)}
                  onValueChange={(value) => setChosenYear(Number(value))}
                >
                  <SelectTrigger className="h-8 w-24 px-2 text-sm font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={next === null}
                  onClick={() => setChosenYear(next)}
                  aria-label="Next year with dives"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* A segmented control built from plain buttons - the app has no
                tabs/toggle-group primitive, and the gas card above already draws
                this exact row. */}
            <div
              className="flex items-center rounded-md border p-0.5"
              role="group"
              aria-label="Bar size"
            >
              {DIVE_ACTIVITY_SCOPES.map((option) => (
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
                  {DIVE_ACTIVITY_SCOPE_LABELS[option]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {points === null ? (
          <SectionSpinner />
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

// The headline figures for what's on screen. The bars show the shape; these
// answer "how much, and is it more than before", which a row of columns is
// worst at answering precisely.
function DiveActivitySummaryRow({
  summary,
  scope,
}: {
  summary: DiveActivitySummary;
  scope: DiveActivityScope;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-8 gap-y-3">
      <ChartStat label="Dives">
        <span className="text-xl font-semibold tabular-nums">
          {summary.dives}
        </span>
        <Change summary={summary} />
      </ChartStat>
      <ChartStat label={scope === "month" ? "Busiest month" : "Busiest year"}>
        <span className="text-xl font-semibold">{summary.busiestLabel}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {summary.busiestDives} {summary.busiestDives === 1 ? "dive" : "dives"}
        </span>
      </ChartStat>
    </div>
  );
}

// Change against the previous year with diving.
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
