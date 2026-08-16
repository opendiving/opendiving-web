"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useResource } from "@/hooks/useResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { formatDateTime, formatTripDateRange } from "@/lib/date-time";
import { formatTripLocationNames } from "@/lib/trip-locations";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TripDialog } from "@/components/trips/trip-dialog";
import { TripLocationsMap } from "@/components/trips/trip-locations-map-lazy";
import { PageHeader } from "@/components/ui/page-header";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { NotFoundState } from "@/components/ui/not-found-state";
import { Edit, Trash2, Plus, Calendar, MapPin, Loader2 } from "lucide-react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/page-spinner";

export default function TripDetailPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const {
    resource: trip,
    setResource: setTrip,
    isLoading: isLoadingTrip,
  } = useResource<Trip>(tripsAPI.getTrip, {
    enabled: !!user,
    errorMessage: "Failed to load trip details. Please try again.",
    redirectTo: "/trips",
  });

  const del = useDeleteResource(tripsAPI.deleteTrip, {
    confirmMessage:
      "Are you sure you want to delete this trip? This action cannot be undone.",
    successMessage: "Trip deleted successfully.",
    errorMessage: "Failed to delete trip. Please try again.",
    onDeleted: () => router.push("/trips"),
  });
  const isDeleting = del.deletingId !== null;

  const formatDate = (dateString: string) =>
    formatDateTime(dateString, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const tripDateRange = trip
    ? formatTripDateRange(trip.start_date, trip.end_date, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : undefined;

  const tripLocations = trip?.locations ?? [];
  const tripLocationNames = formatTripLocationNames(tripLocations);
  // Only places the geocoder gave a position to can be drawn; the rows below
  // list all of them either way, so a typed-in place isn't silently dropped.
  const mappedLocations = tripLocations.filter(
    (location) => location.latitude != null && location.longitude != null,
  );

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingTrip) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SectionSpinner />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NotFoundState
          message="Trip not found."
          backHref="/trips"
          backLabel="Back to Trips"
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader
        backHref="/trips"
        backLabel="Back to Trips"
        title={trip.name}
        subtitle={
          tripLocationNames && tripDateRange
            ? `${tripDateRange} · ${tripLocationNames}`
            : (tripLocationNames ?? tripDateRange ?? undefined)
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="destructive"
              onClick={() => del.requestDelete(trip.uuid)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </>
        }
      />

      <TripDialog
        userId={user?.uuid ?? ""}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        trip={trip}
        onSaved={setTrip}
      />

      <ConfirmDialog
        open={del.pendingId !== null}
        onOpenChange={(open) => !open && del.cancelDelete()}
        title="Delete trip"
        description={del.confirmMessage}
        confirmText="Delete"
        isLoading={isDeleting}
        onConfirm={del.confirmDelete}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentDivesCard
            userId={user?.uuid ?? ""}
            tripId={trip.uuid}
            limit={100}
            title="Dives in this Trip"
            description="All dives logged as part of this trip"
            viewAllHref={null}
            emptyTitle="No dives logged for this trip yet"
            emptyDescription="Log a dive and assign it to this trip to see it here."
            newDiveHref={`/dives/new?trip_uuid=${trip.uuid}`}
            newDiveLabel="Log a Dive for this Trip"
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Trip Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {tripLocations.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    {tripLocations.length > 1 ? "Locations" : "Location"}
                  </div>
                  {/* One row per place, in the order the diver arranged them,
                      rather than the joined line the header and the trips table
                      show: this is the one surface with room for the context
                      that tells two places of the same name apart. */}
                  <ul className="space-y-1.5">
                    {tripLocations.map((location, index) => (
                      <li
                        key={`${location.name}-${index}`}
                        className="flex items-start gap-2 text-sm"
                      >
                        <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block">{location.name}</span>
                          {location.display_name && (
                            <span className="block text-xs text-muted-foreground">
                              {location.display_name}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {mappedLocations.length > 0 && (
                <TripLocationsMap locations={mappedLocations} />
              )}
              {tripDateRange && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Trip Dates
                  </div>
                  <div className="text-sm">{tripDateRange}</div>
                </div>
              )}
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Created on
                </div>
                <div className="text-sm">{formatDate(trip.created_at)}</div>
              </div>
              <Button className="w-full" asChild>
                <Link href={`/dives/new?trip_uuid=${trip.uuid}`}>
                  <Plus className="h-4 w-4 mr-2" />
                  Log a Dive for this Trip
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
