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
import { EmptyState } from "@/components/ui/empty-state";
import { useQuickCreate } from "@/components/layout/quick-create";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { TripCard } from "@/components/trips/trip-card";
import { BackdropCardSkeleton } from "@/components/ui/backdrop-card";
import { TripDialog } from "@/components/trips/trip-dialog";
import { Luggage, Plus } from "lucide-react";

const RECENT_TRIPS_COUNT = 5;

// The plain-delete toast, and the first half of the one a move gets - "moved to
// Cebu 2026" is an addition to what happened, not a replacement for it.
const DELETED_MESSAGE = "Trip deleted successfully.";

// Shows the user's most recent trips by trip date (up to 5), each editable and
// deletable where it stands. Used on the Home page so divers can quickly jump
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
    reload,
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
      // Read again rather than dropping the row: the card shows the latest
      // five, so a delete owes it the sixth, and one that moved its dives
      // changes another trip's counts.
      onDeleted: () => reload(),
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
          // Busy on the list, hidden on each placeholder, as `/trips` does.
          <ul className="space-y-3" aria-busy>
            {Array.from({ length: RECENT_TRIPS_COUNT }, (_, index) => (
              <BackdropCardSkeleton key={index} />
            ))}
          </ul>
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
            {recentTrips.map((trip) => (
              <TripCard
                key={trip.uuid}
                trip={trip}
                onEdit={() => setEditingTrip(trip)}
                onDelete={() => requestDelete(trip.uuid)}
                isDeleting={deletingId === trip.uuid}
              />
            ))}
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
