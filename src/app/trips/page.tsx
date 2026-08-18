"use client";

import { useCallback, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { usePaginatedResource } from "@/hooks/usePaginatedResource";
import { useDeleteWithReassign } from "@/hooks/useDeleteWithReassign";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { formatTripDateRange } from "@/lib/date-time";
import { Button } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/count-badge";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { TripDialog } from "@/components/trips/trip-dialog";
import { TripLocationsLabel } from "@/components/trips/trip-locations-label";
import { Plus, Eye, Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/page-spinner";

export default function TripsPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  // `null` = the dialog is closed; a trip = editing it; `undefined` = creating.
  const [editingTrip, setEditingTrip] = useState<Trip | null | undefined>(null);

  const fetchTrips = useCallback(
    (page: number, perPage: number) => {
      if (!user) return Promise.reject(new Error("Not authenticated"));
      return tripsAPI.getTrips(user.uuid, page, perPage);
    },
    [user],
  );

  const {
    items: trips,
    isLoading: isLoadingTrips,
    totalCount,
    currentPage,
    itemsPerPage,
    hasMore,
    fetchPage: fetchTripsPage,
    refetch,
  } = usePaginatedResource<Trip>(fetchTrips, {
    enabled: !!user,
    errorMessage: "Failed to load trips. Please try again.",
  });

  const {
    deletingId,
    pendingId,
    confirmMessage,
    requestDelete: requestDeleteTrip,
    cancelDelete: cancelDeleteTrip,
    confirmDelete: confirmDeleteTrip,
  } = useDeleteWithReassign(tripsAPI.deleteTrip, {
    confirmMessage:
      "Are you sure you want to delete this trip? This action cannot be undone.",
    successMessage: "Trip deleted successfully.",
    errorMessage: "Failed to delete trip. Please try again.",
    onDeleted: refetch,
  });

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Trips</h1>
          <p className="text-muted-foreground mt-2">
            Group your dives into trips and liveaboards
          </p>
        </div>
        <Button onClick={() => setEditingTrip(undefined)}>
          <Plus className="h-4 w-4 mr-2" />
          New Trip
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Trip List</span>
            <CountBadge
              count={totalCount}
              isLoading={isLoadingTrips}
              label="total trip"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isLoadingTrips && trips.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                No trips yet. Create your first trip to group your dives!
              </div>
              <Button onClick={() => setEditingTrip(undefined)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Trip
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Locations</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.length === 0 && (
                  <TableRowsSkeleton columns={4} rows={itemsPerPage} />
                )}
                {trips.map((trip) => (
                  <TableRow key={trip.uuid}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/trips/${trip.uuid}`}
                        className="hover:underline"
                      >
                        {trip.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {formatTripDateRange(trip.start_date, trip.end_date) ??
                        "-"}
                    </TableCell>
                    <TableCell>
                      <TripLocationsLabel
                        locations={trip.locations}
                        fallback="-"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/trips/${trip.uuid}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Edit"
                          onClick={() => setEditingTrip(trip)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <PaginationFooter
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalCount={totalCount}
            hasMore={hasMore}
            isLoading={isLoadingTrips}
            itemLabel="trips"
            onPageChange={fetchTripsPage}
          />
        </CardContent>
      </Card>

      <TripDialog
        userId={user?.uuid ?? ""}
        open={editingTrip !== null}
        onOpenChange={(open) => !open && setEditingTrip(null)}
        trip={editingTrip}
        onSaved={refetch}
      />

      <DeleteWithReassignDialog
        kind="trip"
        userId={user?.uuid ?? ""}
        targetId={pendingId}
        title="Delete trip"
        description={confirmMessage}
        isDeleting={deletingId === pendingId}
        onCancel={cancelDeleteTrip}
        onConfirm={confirmDeleteTrip}
      />
    </div>
  );
}
