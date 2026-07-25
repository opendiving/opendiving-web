"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { divesAPI, Dive } from "@/lib/api/dives";
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
  username: string;
}

// Shows the 5 most recent dives for a user (dive number, date, duration, max depth).
// Used on both the dashboard and profile pages so they stay in sync.
export function RecentDivesCard({ username }: RecentDivesCardProps) {
  const [recentDives, setRecentDives] = useState<Dive[]>([]);
  const [isLoadingDives, setIsLoadingDives] = useState(true);

  useEffect(() => {
    const fetchRecentDives = async () => {
      if (!username) return;

      try {
        setIsLoadingDives(true);
        const response = await divesAPI.getDives(username, 1, RECENT_DIVES_COUNT);
        setRecentDives(response.data);
      } catch (error) {
        console.error("Failed to fetch recent dives:", error);
      } finally {
        setIsLoadingDives(false);
      }
    };

    fetchRecentDives();
  }, [username]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <Fish className="h-5 w-5 mr-2" />
            Recent Dives
          </CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dives">View All Dives</Link>
          </Button>
        </div>
        <CardDescription>
          Your latest underwater adventures
        </CardDescription>
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
              No dives logged yet
            </h3>
            <p className="text-gray-500 mb-4">
              Start your diving journey by logging your first dive!
            </p>
            <Button asChild>
              <Link href="/dives/new">
                <Plus className="h-4 w-4 mr-2" />
                Log Your First Dive
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {recentDives.map((dive) => (
              <Link
                key={dive.id}
                href={`/dives/${dive.id}`}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors"
              >
                <div>
                  <div className="font-medium text-gray-900">
                    Dive #{dive.dive_number}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDiveDate(dive.start_time)}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatDiveDuration(dive.duration)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Gauge className="h-4 w-4" />
                    {dive.max_depth ? `${dive.max_depth}m` : '-'}
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
