"use client";

import { useEffect, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { HomePageFrame } from "@/components/home/home-page-frame";
import { diveStatsAPI, UserDiveStats } from "@/lib/api/dive-stats";
import { getApiErrorMessage } from "@/lib/api/error";
import type { Location } from "@/lib/api/location";
import { tripsAPI } from "@/lib/api/trips";
import { PageSpinner } from "@/components/ui/page-spinner";

// The signed-in home page. `HomePageFrame` draws it; this reads what the page
// itself owns, the headline stats and the places of the diver's trips, and
// hands them over.
export function HomePageContent() {
  const { user, isAuthenticated, isLoading } = useAuthGuard();
  const [stats, setStats] = useState<UserDiveStats | null>(null);
  // A failed stats fetch used to only `console.error`, leaving all three tiles on
  // "—" forever - indistinguishable from a request that never finished. There is no
  // legitimate empty case to confuse it with: the API returns zeroed stats for a
  // diver with no dives rather than a 404, so anything that lands here is genuinely
  // exceptional and worth saying out loud.
  const [statsError, setStatsError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Null while in flight. A failure reads as no places: the hero falls back to
  // the whole world, which is a map rather than an error, and the page has
  // nothing a diver could do about it.
  const [places, setPlaces] = useState<Location[] | null>(null);

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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    tripsAPI
      .getTripPlaces()
      .then((data) => {
        if (!cancelled) setPlaces(data);
      })
      .catch((error) => {
        console.error("Failed to fetch trip places:", error);
        if (!cancelled) setPlaces([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect to signin
  }

  return (
    <HomePageFrame
      stats={stats}
      places={places}
      statsError={statsError}
      onRetryStats={() => setAttempt((n) => n + 1)}
    />
  );
}
