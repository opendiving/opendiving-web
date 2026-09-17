"use client";

import { useEffect, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { DashboardPageFrame } from "@/components/dashboard/dashboard-page-frame";
import { diveStatsAPI, UserDiveStats } from "@/lib/api/dive-stats";
import { getApiErrorMessage } from "@/lib/api/error";
import { PageSpinner } from "@/components/ui/page-spinner";

// The signed-in home page. `DashboardPageFrame` draws it; this reads the one
// figure the page itself owns, the headline stats, and hands them over.
export default function DashboardPage() {
  const { user, isAuthenticated, isLoading } = useAuthGuard();
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

  return (
    <DashboardPageFrame
      stats={stats}
      statsError={statsError}
      onRetryStats={() => setAttempt((n) => n + 1)}
    />
  );
}
