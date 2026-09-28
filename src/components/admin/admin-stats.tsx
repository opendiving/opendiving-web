"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { adminAPI, type AdminStats } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/error";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IconTooltip } from "@/components/ui/tooltip";
import { ChartStat } from "@/components/dives/chart-stat";
import { DailyBarChart } from "@/components/admin/daily-bar-chart";
import {
  type StatsMonth,
  accountSeries,
  activitySeries,
  currentMonth,
  dailyActive,
  dayLabel,
  monthLabel,
  monthRange,
  stepMonth,
} from "@/components/admin/daily-stats";

type Loaded =
  | { month: StatsMonth; stats: AdminStats }
  | { month: StatsMonth; error: string };

/**
 * The daily totals: accounts created per day and by which door, sign-ins and
 * active accounts per day, and the figures beside them - one UTC month at a
 * time, one request per month.
 *
 * Nothing here names an account, because nothing the route returns does. And
 * there is no 7- or 30-day active figure: the API records a day's total and
 * never who made it up, so a count of distinct accounts over a window does not
 * exist to be shown. Peak and average daily active are what the month's days
 * can honestly say.
 */
export function AdminStatsScreen() {
  const [thisMonth] = useState(() => currentMonth());
  const [month, setMonth] = useState(thisMonth);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Keyed by month rather than cleared on a step, so what is on screen is always
  // the month the label names: a response for a month already stepped away from
  // is dropped, and a return to this route (which stays mounted) re-reads the
  // same month without blanking it into skeletons first.
  useEffect(() => {
    let cancelled = false;
    const { from, to } = monthRange(month);
    adminAPI.getStats(from, to).then(
      (stats) => {
        if (!cancelled) setLoaded({ month, stats });
      },
      (error) => {
        if (!cancelled) {
          setLoaded({
            month,
            error: getApiErrorMessage(
              error,
              "Failed to load the stats. Please try again.",
            ),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [month, attempt]);

  const shown = loaded?.month === month ? loaded : null;
  const label = monthLabel(month);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Stats</h1>
        <p className="text-muted-foreground mt-2">
          Daily totals of accounts created, sign-ins and active accounts. Days
          are UTC.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-1">
        <IconTooltip label="Previous month">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setMonth(stepMonth(month, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </IconTooltip>
        <span
          className="w-40 text-center text-sm font-medium"
          aria-live="polite"
        >
          {label}
        </span>
        {/* Nothing has happened after this month yet. */}
        <IconTooltip label="Next month">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            disabled={month >= thisMonth}
            onClick={() => setMonth(stepMonth(month, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </IconTooltip>
      </div>

      {shown && "error" in shown ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm">{shown.error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setLoaded(null);
                setAttempt((count) => count + 1);
              }}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <StatsCards stats={shown?.stats ?? null} label={label} />
      )}
    </div>
  );
}

function StatsCards({
  stats,
  label,
}: {
  stats: AdminStats | null;
  label: string;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Totals</CardTitle>
          <CardDescription>
            Active now counts accounts holding a live session. Peak and average
            daily active are for {label}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats ? <Totals stats={stats} /> : <TotalsSkeleton />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">New accounts</CardTitle>
          <CardDescription>
            Accounts created each day, by the way they came in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats ? (
            <DailyBarChart
              days={stats.days.map((day) => day.day)}
              series={accountSeries(stats)}
              layout="stacked"
              description={describeAccounts(stats, label)}
              emptyMessage={`No accounts were created in ${label}.`}
            />
          ) : (
            <ChartFrame />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Activity</CardTitle>
          <CardDescription>
            Accounts that signed in, and accounts with a session in use, each
            day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats ? (
            <DailyBarChart
              days={stats.days.map((day) => day.day)}
              series={activitySeries(stats)}
              layout="grouped"
              description={describeActivity(stats, label)}
              emptyMessage={`No account signed in or used a session in ${label}.`}
            />
          ) : (
            <ChartFrame />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Totals({ stats }: { stats: AdminStats }) {
  const { peak, peakDay, average } = dailyActive(stats);

  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
      <ChartStat label="Accounts">
        <span className="text-xl font-semibold tabular-nums">
          {stats.totals.accounts}
        </span>
      </ChartStat>
      <ChartStat label="Active now">
        <span className="text-xl font-semibold tabular-nums">
          {stats.totals.active_now}
        </span>
      </ChartStat>
      <ChartStat label="Peak daily active">
        <span className="text-xl font-semibold tabular-nums">{peak}</span>
        {peakDay && (
          <span className="text-sm text-muted-foreground">
            on {dayLabel(peakDay)}
          </span>
        )}
      </ChartStat>
      <ChartStat label="Average daily active">
        <span className="text-xl font-semibold tabular-nums">
          {average === null ? "-" : average.toFixed(1)}
        </span>
      </ChartStat>
    </div>
  );
}

// The row above, before it arrives: four label-and-figure pairs, the shape
// `ChartSkeleton` draws for the dashboard's stat rows.
function TotalsSkeleton() {
  return (
    <div aria-busy className="flex flex-wrap items-end gap-x-8 gap-y-3">
      {Array.from({ length: 4 }, (_, stat) => (
        <div key={stat}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-1.5 h-7 w-24" />
        </div>
      ))}
    </div>
  );
}

// A chart and its key, before they arrive. The plot keeps the `3:1` box, and the
// height it holds below 560px, that `DailyBarChart` draws at.
function ChartFrame() {
  return (
    <div aria-busy>
      <Skeleton className="aspect-[3/1] min-h-[calc(560px/3)] w-full" />
      <Skeleton className="mt-3 h-5 w-64 max-w-full" />
    </div>
  );
}

function describeAccounts(stats: AdminStats, label: string): string {
  const totals = stats.days.map((day) =>
    Object.values(day.accounts_created).reduce((sum, count) => sum + count, 0),
  );
  const total = totals.reduce((sum, count) => sum + count, 0);
  if (total === 0) return `New accounts per day in ${label}: none.`;

  const busiest = totals.indexOf(Math.max(...totals));
  return `New accounts per day in ${label}, ${total} in total. Busiest day: ${dayLabel(stats.days[busiest].day)}, with ${totals[busiest]}.`;
}

function describeActivity(stats: AdminStats, label: string): string {
  const { peak, peakDay } = dailyActive(stats);
  const signIns = stats.days.reduce((sum, day) => sum + day.sign_ins, 0);
  if (peakDay === null && signIns === 0) {
    return `Sign-ins and active accounts per day in ${label}: none.`;
  }

  return `Sign-ins and active accounts per day in ${label}.${peakDay ? ` Most active day: ${dayLabel(peakDay)}, with ${peak} active ${peak === 1 ? "account" : "accounts"}.` : ""}`;
}
