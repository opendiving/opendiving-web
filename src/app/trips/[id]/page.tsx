"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useResource } from "@/hooks/useResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { divesAPI } from "@/lib/api/dives";
import { fetchAllPages, isAbortError } from "@/lib/api/client";
import { distinctContactUuids } from "@/lib/contact";
import { useContactsByUuid } from "@/hooks/useContactsByUuid";
import { formatDateTime, formatTripDateRange } from "@/lib/date-time";
import { formatTripLocationNames } from "@/lib/trip-locations";
import { TripLocationsLabel } from "@/components/trips/trip-locations-label";
import { formatTripSpan, tripPartLocations } from "@/lib/trip-parts";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { TripDialog } from "@/components/trips/trip-dialog";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import { PageHeader } from "@/components/ui/page-header";
import { DetailPageSkeleton } from "@/components/ui/page-skeleton";
import { NotFoundState } from "@/components/ui/not-found-state";
import {
  BedDouble,
  Edit,
  Trash2,
  Plus,
  Calendar,
  MapPin,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/page-spinner";

// The plain-delete toast, and the first half of the one a move gets - "moved to
// Cebu 2026" is an addition to what happened, not a replacement for it.
const DELETED_MESSAGE = "Trip deleted successfully.";

// This page has room for the month spelled out, unlike the trips table.
const LONG_DATE: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

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
    successMessage: DELETED_MESSAGE,
    errorMessage: "Failed to delete trip. Please try again.",
    onDeleted: () => router.push("/trips"),
  });
  const isDeleting = del.deletingId !== null;

  // Who the diver dived with on this trip: the contacts its dives name, derived
  // here rather than stored on the trip, so it can never disagree with them - a
  // week split between two shops lists both. The dives card below loads ten at a
  // time as the reader scrolls, so the line reads every dive of the trip itself,
  // once, keyed on the trip it was read for.
  const tripUuid = trip?.uuid;
  const [divedWith, setDivedWith] = useState<{
    tripUuid: string;
    contactUuids: string[];
  } | null>(null);
  useEffect(() => {
    if (!tripUuid) return;
    const controller = new AbortController();
    fetchAllPages(
      (page, perPage) => divesAPI.getDives(page, perPage, tripUuid),
      {
        signal: controller.signal,
        label: "the trip's dives",
        keyOf: (dive) => dive.uuid,
      },
    )
      .then((dives) =>
        setDivedWith({ tripUuid, contactUuids: distinctContactUuids(dives) }),
      )
      .catch((error) => {
        // Non-fatal: the line is left off, as a failed trip lookup leaves the
        // dive page's trip link off.
        if (!isAbortError(error)) {
          console.error("Failed to fetch the trip's dives:", error);
        }
      });
    return () => controller.abort();
  }, [tripUuid]);
  const divedWithUuids =
    divedWith && divedWith.tripUuid === tripUuid ? divedWith.contactUuids : [];

  const contacts = useContactsByUuid([
    ...(trip?.parts ?? []).map((part) => part.accommodation_uuid),
    ...divedWithUuids,
  ]);
  const divedWithNames = divedWithUuids
    .map((uuid) => contacts[uuid]?.name)
    .filter((name): name is string => !!name);

  const formatDate = (dateString: string) =>
    formatDateTime(dateString, LONG_DATE);

  const tripParts = trip?.parts ?? [];
  const tripDateRange = formatTripSpan(tripParts, LONG_DATE);

  const tripLocations = tripPartLocations(tripParts);
  // Only whether there is a place to name, which is what decides the separator
  // below. The subtitle's own text and hover hint come from rendering
  // `TripLocationsLabel`, so the cap lives there with the trips table's and the
  // dashboard card's rather than being passed a second time from here.
  const tripLocationNames = formatTripLocationNames(tripLocations);
  // Only places the geocoder gave a position to can be drawn; the parts below
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
    return <DetailPageSkeleton backHref="/trips" backLabel="Back to trips" />;
  }

  if (!trip) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NotFoundState
          message="Trip not found."
          backHref="/trips"
          backLabel="Back to trips"
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader
        backHref="/trips"
        backLabel="Back to trips"
        title={trip.name}
        subtitle={
          tripLocationNames || tripDateRange ? (
            <>
              {tripDateRange}
              {tripDateRange && tripLocationNames ? " · " : null}
              <TripLocationsLabel locations={tripLocations} />
            </>
          ) : undefined
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
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        trip={trip}
        onSaved={setTrip}
      />

      <DeleteWithReassignDialog
        kind="trip"
        targetId={del.pendingId}
        isDeleting={isDeleting}
        onCancel={del.cancelDelete}
        onConfirm={(moveDivesTo, name) =>
          del.confirmDelete(
            moveDivesTo,
            name ? `${DELETED_MESSAGE} Its dives moved to ${name}.` : undefined,
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentDivesCard
            complete
            enabled={!!user}
            tripId={trip.uuid}
            title="Dives in this Trip"
            // Not "logged as part of this trip": a part is a noun here now, and
            // that sentence reads as a claim about which stretch a dive was on.
            description="Every dive logged on this trip"
            viewAllHref={null}
            emptyTitle="No dives logged for this trip yet"
            emptyDescription="Log a dive and assign it to this trip to see it here."
            newDiveHref={`/dives/new?trip_uuid=${trip.uuid}`}
            newDiveLabel="Log a dive for this trip"
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Trip Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {tripParts.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    {tripParts.length > 1 ? "Parts" : "Part"}
                  </div>
                  {/* One row per part, in the order the diver arranged them,
                      rather than the capped joined line the header and the trips
                      table show: this is the one surface with room to name every
                      place and put the part's own dates beneath each. A part
                      with no place is still a row - it is a stretch of the trip,
                      and dropping it would renumber the rest. */}
                  <ul className="space-y-1.5">
                    {tripParts.map((part, index) => {
                      const dates = formatTripDateRange(
                        part.start_date ?? undefined,
                        part.end_date ?? undefined,
                      );
                      const accommodation = part.accommodation_uuid
                        ? contacts[part.accommodation_uuid]
                        : undefined;
                      return (
                        <li
                          key={index}
                          className="flex items-start gap-2 text-sm"
                        >
                          <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block">
                              {part.location?.name ?? (
                                <span className="text-muted-foreground">
                                  No place recorded
                                </span>
                              )}
                            </span>
                            {accommodation && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <BedDouble className="h-3.5 w-3.5 shrink-0" />
                                <span className="sr-only">Stayed at </span>
                                {accommodation.name}
                              </span>
                            )}
                            {dates && (
                              <span className="block text-xs text-muted-foreground">
                                {dates}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {divedWithNames.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Dived with
                  </div>
                  <div className="text-sm">{divedWithNames.join(", ")}</div>
                </div>
              )}

              {mappedLocations.length > 0 && (
                <LocationsMap
                  locations={mappedLocations}
                  subject="the trip's locations"
                />
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
                  Log a dive
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
