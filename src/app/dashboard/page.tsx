"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownToLine,
  Clock,
  Plus,
  Waves,
} from "lucide-react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { RecentTripsCard } from "@/components/dives/recent-trips-card";
import { DiveActivityCard } from "@/components/dives/dive-activity-card";
import { GasUseCard } from "@/components/dives/gas-use-card";
import { ServiceDueCard } from "@/components/gear/service-due-card";
import { CertificationExpiryCard } from "@/components/certifications/certification-expiry-card";
import { SetupChecklistCard } from "@/components/dashboard/setup-checklist-card";
import { diveStatsAPI, UserDiveStats } from "@/lib/api/dive-stats";
import { getApiErrorMessage } from "@/lib/api/error";
import { formatDurationHoursMinutes, greetingForHour } from "@/lib/date-time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/page-spinner";
import { useUnits } from "@/hooks/useUnits";
import { formatDepth } from "@/lib/units";

// One headline number. `value` is `null` only while the stats request is in flight,
// and renders as a dash rather than a zero: "0 dives" is a statement about the
// logbook, and showing it before the answer is known reads as one.
function StatCard({
  title,
  icon,
  value,
  hint,
}: {
  title: string;
  icon: ReactNode;
  value: string | null;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value ?? "—"}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

// The signed-in home page.
//
// Everything on it is derived from something the diver has actually logged, and the
// three cards that can have nothing to say - gear service, certification renewals, the
// setup checklist - return `null` rather than an empty tile. They are direct children
// of the page's `space-y-6` stack for exactly that reason: a wrapper `<div>` around
// them would leave its own gap behind on the days they render nothing.
//
// See DECISIONS.md ("The dashboard shows only what the app actually tracks") for what
// used to be here and why it went.
export default function DashboardPage() {
  const { user, isAuthenticated, isLoading } = useAuthGuard();
  const units = useUnits();
  const [stats, setStats] = useState<UserDiveStats | null>(null);
  // A failed stats fetch used to only `console.error`, leaving all three tiles on
  // "—" forever - indistinguishable from a request that never finished. There is no
  // legitimate empty case to confuse it with: the API returns zeroed stats for a
  // diver with no dives rather than a 404, so anything that lands here is genuinely
  // exceptional and worth saying out loud.
  const [statsError, setStatsError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchStats = async () => {
      try {
        const data = await diveStatsAPI.getDiveStats();
        if (cancelled) return;
        setStats(data);
        setStatsError(null);
      } catch (error) {
        console.error("Failed to fetch dive stats:", error);
        if (cancelled) return;
        setStatsError(
          getApiErrorMessage(error, "Couldn't load your dive stats."),
        );
      }
    };

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [user, attempt]);

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect to signin
  }

  // Kept true while the stats are still loading, so the tiles and the chart hold their
  // place instead of appearing a beat after everything else. Once the answer is in and
  // it's zero, both are hidden: a row of zeroes and a chart of nothing say less to a
  // diver with an empty logbook than the checklist and the "log your first dive"
  // prompt directly below them already do.
  //
  // A failed fetch takes the same branch as "still loading" so the tiles keep their
  // place, and the error card below explains why they are empty.
  const hasDives = stats === null || stats.total_dives > 0;

  // Read straight off the clock during render rather than from state: everything
  // above this point means the heading only ever renders after the auth check has
  // settled in an effect, so the server's hour never reaches the markup and there
  // is nothing for hydration to disagree about. The greeting is fixed for as long
  // as the page stays mounted, which is the right trade - a dashboard left open
  // past midnight is not worth a timer.
  const greeting = greetingForHour(new Date().getHours());

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {greeting}, {user.name}!
          </h1>
          <p className="text-muted-foreground">
            Your logbook, your trips and your stats, at a glance
          </p>
        </div>
        <Button asChild>
          <Link href="/dives/new?from=/dashboard">
            <Plus className="h-4 w-4 mr-2" />
            Log a dive
          </Link>
        </Button>
      </div>

      {/* Anything needing action comes first - a regulator that is out of service or a
          rescue card that has lapsed matters more than how many dives are in the log.
          Both render nothing on a normal day. */}
      <ServiceDueCard userId={user.uuid} />
      <CertificationExpiryCard userId={user.uuid} />
      <SetupChecklistCard
        userId={user.uuid}
        totalDives={stats?.total_dives ?? null}
      />

      {statsError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{statsError}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {hasDives && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="Total Dives"
            icon={<Waves className="h-4 w-4 text-muted-foreground" />}
            value={stats && String(stats.total_dives)}
            hint="Logged in your logbook"
          />
          <StatCard
            title="Max Depth"
            icon={<ArrowDownToLine className="h-4 w-4 text-muted-foreground" />}
            value={stats && formatDepth(stats.max_depth, units)}
            hint="Personal best"
          />
          <StatCard
            title="Total Time"
            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
            value={stats && formatDurationHoursMinutes(stats.total_time)}
            hint="Underwater"
          />
        </div>
      )}

      {/* The two cards that say something about how the diving is *going*, rather than
          just what was logged, so they lead the rest. Gas consumption first: it's the
          one that can change how you dive tomorrow, where activity is a record of what
          already happened - and it's the harder-won number, since it needs dives that
          recorded pressures and an average depth.

          Stacked, not side by side, and that was measured rather than assumed: each
          plot needs 560px to keep twelve month labels legible, and a two-column grid
          gives it 482px even on a widened page. Both charts clip, their axis text
          halves, and the gas card's header doubles in height when its controls can no
          longer share a line with its description. See DECISIONS.md. */}
      {hasDives && <GasUseCard />}
      {hasDives && <DiveActivityCard />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentDivesCard userId={user.uuid} />
        <RecentTripsCard userId={user.uuid} />
      </div>
    </div>
  );
}
