"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { tripsAPI, Trip } from "@/lib/api/trips";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatTripDateRange } from "@/lib/date-time";
import { Luggage, Plus, Calendar, Loader2 } from "lucide-react";

const RECENT_TRIPS_COUNT = 5;

// Only show a date when the trip has an explicit start/end date set; we
// deliberately don't fall back to the trip's creation date here.
function formatTripDisplayDate(trip: Trip) {
  return formatTripDateRange(trip.start_date, trip.end_date);
}

export interface RecentTripsCardProps {
  username: string;
}

// Shows the user's most recently created trips (up to 5). Used on the
// dashboard so divers can quickly jump back into a trip they're logging dives for.
export function RecentTripsCard({ username }: RecentTripsCardProps) {
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);

  useEffect(() => {
    const fetchRecentTrips = async () => {
      if (!username) return;

      try {
        setIsLoadingTrips(true);
        // The trips list endpoint sorts alphabetically by name, so fetch a
        // larger batch and sort by creation date client-side to surface the
        // most *recently created* trips here.
        const response = await tripsAPI.getTrips(username, 1, 100);
        const sorted = [...response.data].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setRecentTrips(sorted.slice(0, RECENT_TRIPS_COUNT));
      } catch (error) {
        console.error("Failed to fetch recent trips:", error);
      } finally {
        setIsLoadingTrips(false);
      }
    };

    fetchRecentTrips();
  }, [username]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <Luggage className="h-5 w-5 mr-2" />
            Recent Trips
          </CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link href="/trips">View All Trips</Link>
          </Button>
        </div>
        <CardDescription>Your latest diving trips</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingTrips ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : recentTrips.length === 0 ? (
          <div className="text-center py-8">
            <Luggage className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No trips yet
            </h3>
            <p className="text-gray-500 mb-4">
              Create a trip to group your dives together!
            </p>
            <Button asChild>
              <Link href="/trips/new">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Trip
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {recentTrips.map((trip) => (
              <Link
                key={trip.id}
                href={`/trips/${trip.id}`}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium text-gray-900">{trip.name}</div>
                {formatTripDisplayDate(trip) && (
                  <div className="flex items-center gap-1 text-sm text-gray-600">
                    <Calendar className="h-4 w-4" />
                    {formatTripDisplayDate(trip)}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
