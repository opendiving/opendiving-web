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

  // Keyed on the uuid rather than on `user`: the auth context replaces that object
  // whenever anything on the account is saved, and a re-fetch of the whole summary
  // on each of those would be three requests for a value none of them changed.
  const userUuid = user?.uuid;
  useEffect(() => {
    if (!userUuid) return;

    const controller = new AbortController();

    const load = async () => {
      try {
        // Every page of them: a diver holds a handful of cards, and a summary that
        // stopped at ten would leave one off the page at the desk.
        const [cards, diveStats, dives] = await Promise.all([
          fetchAllCertifications(controller.signal),
          diveStatsAPI.getDiveStats(),
          // The last dive is read off the list rather than stored: `GET /dives` is
          // sorted by start time descending, so the first row of the first page is
          // it. Same read the new-dive form makes to carry a dive forward.
          divesAPI.getDives(1, 1),
        ]);
        if (controller.signal.aborted) return;

        setCertifications(cards);
        setStats(diveStats);
        setLastDiveAt(dives.data[0]?.start_time ?? null);
      } catch (error) {
        if (controller.signal.aborted) return;
        // Swallowed the way the dashboard's supplementary cards swallow theirs: the
        // profile half of this page is already on screen and correct, and a summary
        // missing its dive count is more use at a desk than an error page.
        console.error("Failed to load the check-in summary:", error);
      } finally {
        if (!controller.signal.aborted) setIsSummaryLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [userUuid]);

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
    />
  );
}
