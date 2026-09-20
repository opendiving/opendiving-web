"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { formatTripDateRange } from "@/lib/date-time";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { TripsPageFrame } from "@/components/trips/trips-page-frame";
import { TableCell, TableRow } from "@/components/ui/table";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { TripDialog } from "@/components/trips/trip-dialog";
import { TripLocationsLabel } from "@/components/trips/trip-locations-label";
import { Eye, Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/page-spinner";

// The plain-delete toast, and the first half of the one a move gets - "moved to
// Cebu 2026" is an addition to what happened, not a replacement for it.
const DELETED_MESSAGE = "Trip deleted successfully.";

// How long to wait after the last keystroke before asking the server, matching
// the courses list and the pickers: long enough that typing a trip name is one
// request rather than ten, short enough not to feel laggy.
const SEARCH_DEBOUNCE_MS = 250;

export default function TripsPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  // `null` = the dialog is closed; a trip = editing it; `undefined` = creating.
  const [editingTrip, setEditingTrip] = useState<Trip | null | undefined>(null);
  // What the box holds, and what has actually been asked for. Splitting them is
  // what keeps the debounce off the input's own responsiveness.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(
      () => setSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  // One term against both columns: the API matches it on the trip's name and on
  // the names of the places it went, so "Egypt" answers a trip called
  // `Liveaboard` that went there.
  const fetchTrips = useCallback(
    (page: number, perPage: number) =>
      tripsAPI.getTrips(page, perPage, search || undefined),
    [search],
  );

  // Changing the search term changes this callback's identity, which is what
  // makes `useInfiniteResource` throw away every page it has loaded and read the
  // new query from the first - rows of the unsearched list are not rows of the
  // searched one, however many of them are already on screen.
  const {
    items: trips,
    isLoading: isLoadingTrips,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    removeItem,
    applySaved,
  } = useInfiniteResource<Trip>(fetchTrips, {
    keyOf: (trip) => trip.uuid,
    enabled: !!user,
    errorMessage: "Failed to load trips. Please try again.",
  });

  const {
    deletingId,
    pendingId,
    requestDelete: requestDeleteTrip,
    cancelDelete: cancelDeleteTrip,
    confirmDelete: confirmDeleteTrip,
  } = useDeleteResource(tripsAPI.deleteTrip, {
    successMessage: DELETED_MESSAGE,
    errorMessage: "Failed to delete trip. Please try again.",
    // The row goes locally rather than by re-reading the pages around it: a
    // diver who has scrolled several pages in should not have the list
    // collapse back to the first one under them.
    onDeleted: removeItem,
  });

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  return (
    <>
      <TripsPageFrame
        isLoading={isLoadingTrips}
        totalCount={totalCount}
        itemsPerPage={itemsPerPage}
        isLoadingMore={isLoadingMore}
        loadFailed={loadFailed}
        hasMore={hasMore}
        onLoadMore={loadMore}
        search={searchInput}
        onSearchChange={setSearchInput}
        isSearching={search.length > 0}
        onNew={() => setEditingTrip(undefined)}
        rows={trips.map((trip) => (
          <TableRow key={trip.uuid}>
            <TableCell className="font-medium">
              <Link href={`/trips/${trip.uuid}`} className="hover:underline">
                {trip.name}
              </Link>
            </TableCell>
            <TableCell>
              {formatTripDateRange(trip.start_date, trip.end_date) ?? "-"}
            </TableCell>
            <TableCell>
              <TripLocationsLabel locations={trip.locations} fallback="-" />
            </TableCell>
            <TableCell className="text-right">
              {/* Named per row, not per action: ten identical "Edit"s tell a
                          screen reader's controls list nothing about which trip.
                          See DECISIONS.md on the export card's Downloads. */}
              <div className="flex justify-end gap-2">
                <IconTooltip label={`View ${trip.name}`}>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/trips/${trip.uuid}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </IconTooltip>
                <IconTooltip label={`Edit ${trip.name}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingTrip(trip)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </IconTooltip>
                <IconTooltip label={`Delete ${trip.name}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => requestDeleteTrip(trip.uuid)}
                    disabled={deletingId === trip.uuid}
                  >
                    {deletingId === trip.uuid ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </IconTooltip>
              </div>
            </TableCell>
          </TableRow>
        ))}
      />

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
        onCancel={cancelDeleteTrip}
        onConfirm={(moveDivesTo, name) =>
          confirmDeleteTrip(
            moveDivesTo,
            name ? `${DELETED_MESSAGE} Its dives moved to ${name}.` : undefined,
          )
        }
      />
    </>
  );
}
