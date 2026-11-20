"use client";

import { Fragment, useEffect, useState } from "react";
import { adminAPI, type AdminExternalRequests } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/error";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DailyBarChart } from "@/components/admin/daily-bar-chart";
import {
  type StatsMonth,
  currentMonth,
  dayLabel,
  monthLabel,
  monthRange,
} from "@/components/admin/daily-stats";
import {
  type ServiceSummary,
  formatCount,
  sentSeries,
  summariseServices,
} from "@/components/admin/external-requests";
import { ExternalRequestServiceCard } from "@/components/admin/external-request-service-card";
import { MonthStepper } from "@/components/admin/month-stepper";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";

type Loaded =
  | { month: StatsMonth; answer: AdminExternalRequests }
  | { month: StatsMonth; error: string };

/**
 * What this instance asked of other services - weather, place names, species
 * and their photos, profile pictures - one UTC month at a time, one request per
 * month: per service, how the requests ended, how long they took, the busiest
 * day against the instance's own limit, and the events that sent nothing.
 */
export function ExternalRequestsScreen() {
  const [thisMonth] = useState(() => currentMonth());
  const [month, setMonth] = useState(thisMonth);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Keyed by month for the stats screen's reason: what is on screen is always
  // the month the label names.
  useEffect(() => {
    let cancelled = false;
    const { from, to } = monthRange(month);
    adminAPI.getExternalRequests(from, to).then(
      (answer) => {
        if (!cancelled) setLoaded({ month, answer });
      },
      (error) => {
        if (!cancelled) {
          setLoaded({
            month,
            error: getApiErrorMessage(
              error,
              "Failed to load the requests. Please try again.",
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
    <div>
      <IndexHero
        backHref="/admin"
        backLabel="Back to admin"
        title="External Requests"
        description="Requests this server sent to other services, and those it answered without sending. Days are UTC, and the counts trail by a few minutes."
      />

      <div className={HERO_BODY}>
        <MonthStepper month={month} thisMonth={thisMonth} onStep={setMonth} />

        {shown && "error" in shown ? (
          <Card>
            <CardContent className="pt-(--card-pad)">
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
        ) : shown ? (
          <Month answer={shown.answer} label={label} />
        ) : (
          <MonthFrame />
        )}
      </div>
    </div>
  );
}

function Month({
  answer,
  label,
}: {
  answer: AdminExternalRequests;
  label: string;
}) {
  const summaries = summariseServices(answer);
  const days = answer.days.map((day) => day.day);
  const sent = summaries.reduce((sum, summary) => sum + summary.all.sent, 0);

  return (
    <div className="space-y-6 max-sm:space-y-2.5">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Services</CardTitle>
          <CardDescription>
            Requests sent to each service in {label}, and the events that sent
            none. The busiest day is measured against the instance&apos;s own
            limit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ServicesTable summaries={summaries} />
          {summaries.every((summary) => summary.all.sent === 0) && (
            <p className="mt-3 text-sm text-muted-foreground">
              No requests were sent in {label}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Each day</CardTitle>
          <CardDescription>
            Requests sent each day, by service, and how many of them did not
            succeed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DailyBarChart
            days={days}
            series={sentSeries(summaries)}
            layout="stacked"
            description={describeDaily(summaries, days, sent, label)}
            emptyMessage={`No requests were sent in ${label}.`}
          />
          {sent > 0 && <DaysTable summaries={summaries} days={days} />}
        </CardContent>
      </Card>

      {summaries.map((summary) => (
        <ExternalRequestServiceCard
          key={summary.provider}
          summary={summary}
          label={label}
        />
      ))}
    </div>
  );
}

function ServicesTable({ summaries }: { summaries: ServiceSummary[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead rowSpan={2}>Service</TableHead>
          <TableHead colSpan={2} scope="colgroup" className="h-8 text-center">
            Sent to the service
          </TableHead>
          <TableHead colSpan={2} scope="colgroup" className="h-8 text-center">
            Not sent
          </TableHead>
          <TableHead rowSpan={2}>Busiest day</TableHead>
        </TableRow>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 text-right">Requests</TableHead>
          <TableHead className="h-8 text-right">Did not succeed</TableHead>
          <TableHead className="h-8 text-right">Own limit reached</TableHead>
          <TableHead className="h-8 text-right">From cache</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {summaries.map(({ provider, all, limit, busiest }) => (
          <TableRow key={provider}>
            <TableHead scope="row" className="text-foreground">
              {provider}
            </TableHead>
            <TableCell className="text-right tabular-nums">
              {formatCount(all.sent)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCount(all.failed)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCount(all.outcomes.skipped ?? 0)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCount(all.outcomes.cache_hit ?? 0)}
            </TableCell>
            <TableCell className="min-w-36">
              <BusiestDay limit={limit} busiest={busiest} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// The busiest day's sent requests against the most the instance's own limit
// admits in a day, in figures as well as drawn. A service with no limit has no
// proportion to draw.
function BusiestDay({
  limit,
  busiest,
}: Pick<ServiceSummary, "limit" | "busiest">) {
  const sent = busiest?.sent ?? 0;
  const figures = `${formatCount(sent)}${limit ? ` of ${formatCount(limit.per_day)}` : ""}`;

  return (
    <div className="space-y-1">
      <div className="text-sm tabular-nums">
        {figures}
        {busiest && (
          <span className="text-muted-foreground">
            {" "}
            on {dayLabel(busiest.day)}
          </span>
        )}
      </div>
      {limit && (
        <Meter
          value={sent}
          max={limit.per_day}
          valueText={`${figures} a day`}
          aria-label="Busiest day against the daily limit"
        />
      )}
    </div>
  );
}

function DaysTable({
  summaries,
  days,
}: {
  summaries: ServiceSummary[];
  days: string[];
}) {
  return (
    <Table className="mt-4">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Day</TableHead>
          <TableHead>Service</TableHead>
          <TableHead className="text-right">Sent</TableHead>
          <TableHead className="text-right">Did not succeed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {days.map((day, index) => {
          const busy = summaries.filter(
            (summary) => summary.sentPerDay[index] > 0,
          );
          return (
            <Fragment key={day}>
              {busy.map((summary, position) => (
                <TableRow key={summary.provider}>
                  <TableCell className="py-2 whitespace-nowrap">
                    {position === 0 ? dayLabel(day) : null}
                  </TableCell>
                  <TableCell className="py-2">{summary.provider}</TableCell>
                  <TableCell className="py-2 text-right tabular-nums">
                    {formatCount(summary.sentPerDay[index])}
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums">
                    {formatCount(summary.failedPerDay[index])}
                  </TableCell>
                </TableRow>
              ))}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

// The month's cards before it arrives: the services table, the daily chart and
// a service card, each at the height it will take.
function MonthFrame() {
  return (
    <div className="space-y-6 max-sm:space-y-2.5">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Services</CardTitle>
        </CardHeader>
        <CardContent>
          <div aria-busy className="space-y-3">
            {Array.from({ length: 6 }, (_, line) => (
              <Skeleton key={line} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Each day</CardTitle>
        </CardHeader>
        <CardContent>
          <div aria-busy>
            <Skeleton className="aspect-[3/1] min-h-[calc(560px/3)] w-full" />
            <Skeleton className="mt-3 h-5 w-64 max-w-full" />
          </div>
        </CardContent>
      </Card>
      <CardSkeleton lines={8} />
    </div>
  );
}

function describeDaily(
  summaries: ServiceSummary[],
  days: string[],
  sent: number,
  label: string,
): string {
  if (sent === 0) return `Requests sent per day in ${label}: none.`;
  const totals = days.map((_, index) =>
    summaries.reduce((sum, summary) => sum + summary.sentPerDay[index], 0),
  );
  const busiest = totals.indexOf(Math.max(...totals));
  return `Requests sent per day in ${label}, by service, ${formatCount(sent)} in total. Busiest day: ${dayLabel(days[busiest])}, with ${formatCount(totals[busiest])}.`;
}
