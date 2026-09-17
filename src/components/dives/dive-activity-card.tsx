"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
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
import { IconTooltip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChartSkeleton } from "@/components/dives/chart-skeleton";
import type { ChartCardProps } from "@/components/dives/chart-card-props";
import { ChartStat } from "@/components/dives/chart-stat";
import { DiveActivityChart } from "@/components/dives/dive-activity-chart";
import { diveStatsAPI, DiveActivityPoint } from "@/lib/api/dive-stats";
import {
  type DiveActivitySummary,
  activityBars,
  activityDays,
  barCeiling,
  summarizeActivity,
} from "@/lib/dive-activity";
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
  parseDiveActivityView,
  readStoredDiveActivityView,
  writeDiveActivityView,
} from "@/lib/dive-activity-view";
import { subscribeToNothing } from "@/lib/chart-series-view";
import { cn } from "@/lib/utils";

// The dashboard's how-much-am-I-diving card, and the counterpart to
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
// restoring the remembered one - is the same code in both cards.
export function DiveActivityCard({ pending = false }: ChartCardProps) {
  const [points, setPoints] = useState<DiveActivityPoint[] | null>(null);
  // This visit's choices, both null until the diver makes one - which is what
  // leaves room for the remembered view underneath. The anchor is always the
  // start of a day with dives, which is what makes switching scope land somewhere
  // useful (the month *containing* the day you were looking at) instead of on an
  // empty period.
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

  // Opens on the whole career, not on a year of it - the opposite default to the
  // gas card's, and deliberate. "How has my diving gone" is the question this
  // card exists for, and a bar per year answers it at any career length, where a
  // dot per dive over the same span is a smear. A single season is one click in.
  const scope = chosenScope ?? remembered?.scope ?? "all";

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

    if (!pending) fetchActivity();
  }, [pending]);

  const days = useMemo(() => activityDays(points ?? []), [points]);

  // The remembered period, checked against the logbook as it exists now - see
  // `resolveAnchor`. Null until the series arrives, which is why the fallback
  // below still has to be there.
  const rememberedAnchor = useMemo(
    () => resolveAnchor(remembered?.anchor ?? null, scope, days),
    [remembered, scope, days],
  );

  // Three sources, most specific first: this visit's pick, then last visit's,
  // then the most recent day with diving - not the first, since the interesting
  // question is how this season is going and the older periods are one click
  // back.
  //
  // The `0` is unreachable except on an empty logbook, where the chart renders
  // its prompt instead of a grid of empty buckets.
  const activeAnchor = anchor ?? rememberedAnchor ?? days[days.length - 1] ?? 0;

  // Remembered for next time. Held back until the series is in: `days` is what
  // `rememberedAnchor` resolves against, so writing before it arrives would
  // persist a null over the very period we're about to restore. That guard also
  // covers the failed-fetch path, which sets an empty series - a request that
  // didn't come back should not erase where you were.
  useEffect(() => {
    if (days.length === 0) return;

    // The *chosen* anchor, never `activeAnchor`. Falling back to the most recent
    // day is a default, not a preference, and persisting it would pin the card to
    // today's newest dive forever - so a diver who never touched the period
    // control would stop following their own diving into next season.
    writeDiveActivityView({ scope, anchor: anchor ?? rememberedAnchor });
  }, [days, scope, anchor, rememberedAnchor]);

  const bars = useMemo(
    () => activityBars(points ?? [], scope, activeAnchor),
    [points, scope, activeAnchor],
  );
  const ceiling = useMemo(
    () => barCeiling(points ?? [], scope),
    [points, scope],
  );
  const summary = useMemo(
    () => summarizeActivity(points ?? [], scope, activeAnchor),
    [points, scope, activeAnchor],
  );

  // "All" spans the whole logbook, so it has no period to step through - the same
  // shape the gas card carries, down to the null that switches the controls off.
  const steppable = scope === "all" ? null : scope;
  const previous = steppable
    ? stepPeriod(activeAnchor, steppable, -1, days)
    : null;
  const next = steppable ? stepPeriod(activeAnchor, steppable, 1, days) : null;
  const periods = useMemo(
    () => (steppable ? availablePeriods(days, steppable) : []),
    [days, steppable],
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
              <BarChart3 className="h-5 w-5" />
              Dive Activity
            </CardTitle>
            <CardDescription>
              {/* Kept short. The header is a wrapping flex row with the period
                  controls on the far side of it, and a description any longer
                  than the gas card's pushes them onto a second line - so the two
                  cards' controls stop lining up down the page. Naming all three
                  bar sizes in full ("day by day, month by month or year by
                  year") is what that budget wouldn't take. What went earlier: a
                  note that the counting happens in each dive's own local time,
                  which is a promise the app keeps everywhere and states nowhere
                  else. */}
              How many dives you logged, by day, month or year.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Only the bounded scopes have a period to navigate. "All" already
                shows every year there is, so arrows on it would have nowhere to
                go. */}
            {scope !== "all" && (
              <div className="flex items-center gap-1">
                <IconTooltip label="Dive activity: previous period with dives">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={previous === null}
                    onClick={() => setAnchor(previous)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </IconTooltip>
                {/* The label is also the jump-to control - stepping one period at
                    a time is fine for "the season before this one" and useless
                    for reaching one several seasons back.

                    Its value is the *period's* start, never `activeAnchor`
                    itself: the anchor is whichever day you happened to land on,
                    which usually matches no option, and a `Select` whose value
                    has no registered item renders an empty trigger. Fixed width -
                    the gas card's, since both now show "September 2026" - so the
                    chart doesn't shift sideways as the label changes. */}
                <span id={periodHintId} className="sr-only">
                  Dive activity period
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
                  {/* Named the same way as the gas card's twin, and for the same
                      reason - `aria-describedby` never reached the accessible
                      name, so an empty trigger had none. See that file. */}
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
                <IconTooltip label="Dive activity: next period with dives">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={next === null}
                    onClick={() => setAnchor(next)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </IconTooltip>
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
                tabs/toggle-group primitive, and the gas card above already draws
                this exact row. */}
            <div
              className="flex items-center rounded-md border p-0.5"
              role="group"
              aria-label="Dive activity: time range"
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
    <div className="mb-5 flex flex-wrap items-end gap-x-8 gap-y-3">
      <ChartStat label="Dives">
        <span className="text-xl font-semibold tabular-nums">
          {summary.dives}
        </span>
        <Change summary={summary} />
      </ChartStat>
      <ChartStat label={BUSIEST_LABELS[scope]}>
        <span className="text-xl font-semibold">{summary.busiestLabel}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {summary.busiestDives} {summary.busiestDives === 1 ? "dive" : "dives"}
        </span>
      </ChartStat>
    </div>
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
