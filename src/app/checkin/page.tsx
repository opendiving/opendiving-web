"use client";

import { useEffect, useState } from "react";

import { useAuthGuard } from "@/hooks/useAuthGuard";
import { CheckInPageFrame } from "@/components/checkin/checkin-page-frame";
import {
  fetchAllCertifications,
  type Certification,
} from "@/lib/api/certifications";
import { diveStatsAPI, type UserDiveStats } from "@/lib/api/dive-stats";
import { divesAPI } from "@/lib/api/dives";
import { PageSpinner } from "@/components/ui/page-spinner";

// The summary a diver hands to a dive shop. `CheckInPageFrame` draws it; this reads
// the three things the page does not already hold, the profile itself arriving with
// the signed-in user.
export default function CheckInPage() {
  const { user, isAuthenticated, isLoading } = useAuthGuard();
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [stats, setStats] = useState<UserDiveStats | null>(null);
  const [lastDiveAt, setLastDiveAt] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Keyed on the uuid rather than on `user`: the auth context replaces that object
  // whenever anything on the account is saved, and a re-fetch of the whole summary
  // on each of those would be three requests for a value none of them changed.
  const userUuid = user?.uuid;
  useEffect(() => {
    if (!userUuid) return;

    const controller = new AbortController();

    // Settled rather than `all`: the three answer different questions, and one of
    // them failing must not take the two that arrived off the page with it. The
    // c-cards are the half a desk actually reads, and they do not depend on the
    // dive count.
    const load = async () => {
      const [cards, diveStats, recent] = await Promise.allSettled([
        // Every page of them: a diver holds a handful of cards, and a summary that
        // stopped at ten would leave one off the page at the desk.
        fetchAllCertifications(controller.signal),
        diveStatsAPI.getDiveStats(),
        // The last dive is read off the list rather than stored: `GET /dives` is
        // sorted by start time descending, so the first row of the first page is
        // it. Same read the new-dive form makes to carry a dive forward.
        divesAPI.getDives(1, 1),
      ]);
      if (controller.signal.aborted) return;

      if (cards.status === "fulfilled") setCertifications(cards.value);
      if (diveStats.status === "fulfilled") setStats(diveStats.value);
      if (recent.status === "fulfilled") {
        setLastDiveAt(recent.value.data[0]?.start_time ?? null);
      }

      // Said out loud rather than swallowed the way the dashboard's supplementary
      // cards swallow theirs: this page is handed to somebody else, and a summary
      // quietly missing its certifications is worse than one that says so. What
      // did arrive stays on screen regardless.
      const failed = [cards, diveStats, recent].filter(
        (result) => result.status === "rejected",
      );
      for (const result of failed) {
        console.error("Failed to load part of the check-in summary:", result);
      }
      setLoadFailed(failed.length > 0);
      setIsSummaryLoading(false);
    };

    load();
    return () => controller.abort();
  }, [userUuid, attempt]);

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect to signin
  }

  return (
    <CheckInPageFrame
      certifications={certifications}
      stats={stats}
      lastDiveAt={lastDiveAt}
      isLoading={isSummaryLoading}
      loadFailed={loadFailed}
      onRetry={() => {
        setIsSummaryLoading(true);
        setLoadFailed(false);
        setAttempt((n) => n + 1);
      }}
    />
  );
}
