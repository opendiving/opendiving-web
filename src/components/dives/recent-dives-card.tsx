"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { divesAPI, Dive } from "@/lib/api/dives";
import { DiveSitesLabel } from "@/components/dives/dive-sites-label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Fish, Waves, Plus, Clock, Gauge, Loader2 } from "lucide-react";

const RECENT_DIVES_COUNT = 5;

// Format a dive's start time for display
function formatDiveDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Format a dive duration (given in seconds)
function formatDiveDuration(durationSeconds: number) {
  const totalMinutes = Math.round(durationSeconds / 60);

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export interface RecentDivesCardProps {
  userId: string;
  // Only show dives belonging to this trip. When omitted, shows the user's
  // most recent dives across all trips.
  tripId?: string;
  // Only show dives made at this dive site. When omitted, shows dives
  // regardless of dive site.
  diveSiteId?: string;
  // Maximum number of dives to fetch/display. Defaults to 5 for the
  // dashboard/profile "recent dives" use case.
  limit?: number;
  title?: string;
  description?: string;
  // Href/label for the header's "view all" button. Pass `null` to hide it
  // entirely (e.g. when the card already shows the full list).
  viewAllHref?: string | null;
  viewAllLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  newDiveHref?: string;
  newDiveLabel?: string;
}

// Shows a list of dives for a user (dive number, date, duration, max depth).
// Used on the dashboard and profile pages (as the 5 most recent dives) and
// on a trip's detail page (filtered to that trip's dives), so they stay in sync.
export function RecentDivesCard({
  userId,
  tripId,
  diveSiteId,
  limit = RECENT_DIVES_COUNT,
  title = "Recent Dives",
  description = "Your latest underwater adventures",
  viewAllHref = "/dives",
  viewAllLabel = "View All Dives",
  emptyTitle = "No dives logged yet",
  emptyDescription = "Start your diving journey by logging your first dive!",
  newDiveHref = "/dives/new",
  newDiveLabel = "Log Your First Dive",
}: RecentDivesCardProps) {
  const [recentDives, setRecentDives] = useState<Dive[]>([]);
  const [isLoadingDives, setIsLoadingDives] = useState(true);

  useEffect(() => {
    const fetchRecentDives = async () => {
      if (!userId) return;

      try {
        setIsLoadingDives(true);
        const response = await divesAPI.getDives(
          userId,
          1,
          limit,
          tripId,
          diveSiteId,
        );
        setRecentDives(response.data);
      } catch (error) {
        console.error("Failed to fetch recent dives:", error);
      } finally {
        setIsLoadingDives(false);
      }
    };

    fetchRecentDives();
  }, [userId, tripId, diveSiteId, limit]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <Fish className="h-5 w-5 mr-2" />
            {title}
          </CardTitle>
          {viewAllHref && (
            <Button variant="outline" size="sm" asChild>
              <Link href={viewAllHref}>{viewAllLabel}</Link>
            </Button>
          )}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingDives ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : recentDives.length === 0 ? (
          <div className="text-center py-12">
            <Waves className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {emptyTitle}
            </h3>
            <p className="text-gray-500 mb-4">{emptyDescription}</p>
            <Button asChild>
              <Link href={newDiveHref}>
                <Plus className="h-4 w-4 mr-2" />
                {newDiveLabel}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {recentDives.map((dive) => (
              <Link
                key={dive.uuid}
                href={`/dives/${dive.uuid}`}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors"
              >
                <div>
                  <div className="font-medium text-gray-900">
                    Dive #{dive.dive_number}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDiveDate(dive.start_time)}
                    {dive.dive_sites.length > 0 && (
                      <span>
                        {" · "}
                        <DiveSitesLabel sites={dive.dive_sites} showLocation />
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatDiveDuration(dive.duration)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Gauge className="h-4 w-4" />
                    {dive.max_depth ? `${Math.round(dive.max_depth)}m` : "-"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
