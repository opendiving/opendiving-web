"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import {
  CARD_TITLE_ACTION,
  CARD_TITLE_ROW,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import {
  DeleteMenuItem,
  ItemActionsMenu,
} from "@/components/ui/item-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRowsSkeleton } from "@/components/ui/skeleton";
import { useQuickCreate } from "@/components/layout/quick-create";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { TripDialog } from "@/components/trips/trip-dialog";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import { formatTripSpan, tripPartLocations } from "@/lib/trip-parts";
import { TripLocationsLabel } from "@/components/trips/trip-locations-label";
import { Luggage, Plus, Calendar, Edit } from "lucide-react";

const RECENT_TRIPS_COUNT = 5;

// The plain-delete toast, and the first half of the one a move gets - "moved to
// Cebu 2026" is an addition to what happened, not a replacement for it.
const DELETED_MESSAGE = "Trip deleted successfully.";

// Shows the user's most recent trips by trip date (up to 5), each editable and
// deletable where it stands. Used on the dashboard so divers can quickly jump
// back into a trip they're logging dives for.
export function RecentTripsCard() {
  const openCreate = useQuickCreate();
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);

  // The trips list endpoint already sorts by each trip's earliest part start,
  // descending, so the first page is exactly the most recent trips - no
  // client-side sorting (which would disagree with /trips).
  const fetchTrips = useCallback(
    (page: number, perPage: number) => tripsAPI.getTrips(page, perPage),
    [],
  );

  const {
    items: recentTrips,
    isLoading: isLoadingTrips,
    removeItem,
    applySaved,
  } = useInfiniteResource<Trip>(fetchTrips, {
    keyOf: (trip) => trip.uuid,
    itemsPerPage: RECENT_TRIPS_COUNT,
    errorMessage: "Failed to load trips. Please try again.",
  });

  const { deletingId, pendingId, requestDelete, cancelDelete, confirmDelete } =
    useDeleteResource(tripsAPI.deleteTrip, {
      successMessage: DELETED_MESSAGE,
      errorMessage: "Failed to delete trip. Please try again.",
      onDeleted: removeItem,
    });

  return (
    <Card>
      <CardHeader>
        <div className={CARD_TITLE_ROW}>
          <CardTitle as="h2" className="flex items-center gap-2">
            <Luggage className="h-5 w-5" />
            Recent Trips
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className={CARD_TITLE_ACTION}
            asChild
          >
            <Link href="/trips">View all trips</Link>
          </Button>
        </div>
        <CardDescription>Your latest diving trips</CardDescription>
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
          <ul className="space-y-3">
            {recentTrips.map((trip) => {
              const locations = tripPartLocations(trip.parts);
              const mappedLocations = locations.filter(
                (location) =>
                  location.latitude != null && location.longitude != null,
              );
              // Only when some part of the trip carries a date; deliberately
              // no fall back to the trip's creation date.
              const dates = formatTripSpan(trip.parts);

              return (
                // The trip's link is stretched over the whole row rather than
                // wrapping it: a button inside an anchor is invalid, and so is
                // the map's attribution link. What has to stay reachable - the
                // actions, the attribution, the locations' hover hint - is
                // lifted above it; `isolate` keeps those lifts inside the row.
                <li
                  key={trip.uuid}
                  className="relative isolate rounded-lg border hover:bg-muted transition-colors"
                >
                  {mappedLocations.length > 0 && (
                    // Flush with the row's top and sides, so its corners are
                    // the row's own, less the border it sits inside. Set on the
                    // frame rather than clipped by the row: the map clips to its
                    // frame's corners, and in Firefox to nothing further up.
                    <LocationsMap
                      locations={mappedLocations}
                      subject={`the places of ${trip.name}`}
                      className="rounded-b-none rounded-t-[calc(var(--radius)-1px)] border-x-0 border-t-0"
                    />
                  )}
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/trips/${trip.uuid}`}
                        className="min-w-0 font-medium text-foreground after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                      >
                        {trip.name}
                      </Link>
                      {/* Named per row, as the trips table's are. */}
                      <div className="relative z-10 flex shrink-0 gap-1">
                        <IconTooltip label={`Edit ${trip.name}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingTrip(trip)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </IconTooltip>
                        <ItemActionsMenu
                          label={`More actions for ${trip.name}`}
                          variant="ghost"
                          size="sm"
                        >
                          <DeleteMenuItem
                            onSelect={() => requestDelete(trip.uuid)}
                            disabled={deletingId === trip.uuid}
                          />
                        </ItemActionsMenu>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <TripLocationsLabel
                        locations={locations}
                        className="relative z-10 min-w-0"
                      />
                      {/* `ml-auto` keeps the dates on the right when there is no
                        place to push them there, and when they wrap. */}
                      {dates && (
                        <div className="ml-auto flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {dates}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <TripDialog
        open={editingTrip !== null}
        onOpenChange={(open) => !open && setEditingTrip(null)}
        trip={editingTrip}
        onSaved={applySaved}
      />

      <DeleteWithReassignDialog
        kind="trip"
        targetId={pendingId}
        isDeleting={deletingId === pendingId}
        onCancel={cancelDelete}
        onConfirm={(moveDivesTo, name) =>
          confirmDelete(
            moveDivesTo,
            name ? `${DELETED_MESSAGE} Its dives moved to ${name}.` : undefined,
          )
        }
      />
    </Card>
  );
}
