"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { TripsPageFrame } from "@/components/trips/trips-page-frame";
import { TripCard } from "@/components/trips/trip-card";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { TripDialog } from "@/components/trips/trip-dialog";
import { useQuickCreate } from "@/components/layout/quick-create";
import { PageSpinner } from "@/components/ui/page-spinner";

// The plain-delete toast, and the first half of the one a move gets - "moved to
// Cebu 2026" is an addition to what happened, not a replacement for it.
const DELETED_MESSAGE = "Trip deleted successfully.";

// How long to wait after the last keystroke before asking the server, matching
// the courses list and the pickers: long enough that typing a trip name is one
// request rather than ten, short enough not to feel laggy.
const SEARCH_DEBOUNCE_MS = 250;

export function TripsPageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const openCreate = useQuickCreate();
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
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
    isCountNarrowed,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    reload,
    removeItem,
    applySaved,
  } = useInfiniteResource<Trip>(fetchTrips, {
    keyOf: (trip) => trip.uuid,
    enabled: !!user,
    isNarrowed: search.length > 0,
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
    // collapse back to the first one under them. Unless its dives moved to
    // another trip, whose card then counts them - that is a delete that
    // changes another row, and only a re-read shows it.
    onDeleted: (id, movedDivesTo) => (movedDivesTo ? reload() : removeItem(id)),
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
        isCountNarrowed={isCountNarrowed}
        itemsPerPage={itemsPerPage}
        isLoadingMore={isLoadingMore}
        loadFailed={loadFailed}
        hasMore={hasMore}
        onLoadMore={loadMore}
        search={searchInput}
        onSearchChange={setSearchInput}
        isSearching={search.length > 0}
        onNew={() => openCreate("trip")}
        cards={trips.map((trip) => (
          <TripCard
            key={trip.uuid}
            trip={trip}
            onEdit={() => setEditingTrip(trip)}
            onDelete={() => requestDeleteTrip(trip.uuid)}
            isDeleting={deletingId === trip.uuid}
          />
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
