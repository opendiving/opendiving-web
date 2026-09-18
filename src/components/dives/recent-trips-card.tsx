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
import { EmptyState } from "@/components/ui/empty-state";
import { ListRowsSkeleton } from "@/components/ui/skeleton";
import { useQuickCreate } from "@/components/layout/quick-create";
import { formatTripDateRange } from "@/lib/date-time";
import { TripLocationsLabel } from "@/components/trips/trip-locations-label";
import { Luggage, Plus, Calendar } from "lucide-react";

const RECENT_TRIPS_COUNT = 5;

// Only show a date when the trip has an explicit start/end date set; we
// deliberately don't fall back to the trip's creation date here.
function formatTripDisplayDate(trip: Trip) {
  return formatTripDateRange(trip.start_date, trip.end_date);
}

// Shows the user's most recent trips by trip date (up to 5). Used on the
// dashboard so divers can quickly jump back into a trip they're logging dives for.
export function RecentTripsCard() {
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);
  const openCreate = useQuickCreate();

  useEffect(() => {
    const fetchRecentTrips = async () => {
      try {
        setIsLoadingTrips(true);
        // The trips list endpoint already sorts by start_date descending, so the
        // first page is exactly the most recent trips - no client-side sorting
        // (which would disagree with the ordering on /trips).
        const response = await tripsAPI.getTrips(1, RECENT_TRIPS_COUNT);
        setRecentTrips(response.data);
      } catch (error) {
        console.error("Failed to fetch recent trips:", error);
      } finally {
        setIsLoadingTrips(false);
      }
    };

    fetchRecentTrips();
  }, []);

  return (
    <Card>
      <CardHeader>
        {/* Same column-plus-action shape as `RecentDivesCard`, and for the same
            reason - see the comment there. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle as="h2" className="flex items-center gap-2">
              <Luggage className="h-5 w-5" />
              Recent Trips
            </CardTitle>
            <CardDescription>Your latest diving trips</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/trips">View all trips</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingTrips ? (
          <ListRowsSkeleton rows={RECENT_TRIPS_COUNT} />
        ) : recentTrips.length === 0 ? (
          <EmptyState
            icon={Luggage}
            title="No trips yet"
            description="Create a trip to group your dives together!"
            action={
              <Button onClick={() => openCreate("trip")}>
                <Plus className="h-4 w-4 mr-2" />
                Add your first trip
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {recentTrips.map((trip) => (
              <Link
                key={trip.uuid}
                href={`/trips/${trip.uuid}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3 rounded-lg border hover:bg-muted transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{trip.name}</div>
                  <TripLocationsLabel
                    locations={trip.locations}
                    className="block text-sm text-muted-foreground"
                  />
                </div>
                {formatTripDisplayDate(trip) && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
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
