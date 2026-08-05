"use client";

import { useCallback } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { usePaginatedResource } from "@/hooks/usePaginatedResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { formatTripDateRange } from "@/lib/date-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { Plus, Eye, Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";

export default function TripsPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();

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

  const { deletingId, handleDelete: handleDeleteTrip } = useDeleteResource(
    tripsAPI.deleteTrip,
    {
      confirmMessage: "Are you sure you want to delete this trip?",
      successMessage: "Trip deleted successfully.",
      errorMessage: "Failed to delete trip. Please try again.",
      onDeleted: refetch,
    },
  );

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
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
          <Button asChild>
            <Link href="/trips/new">
              <Plus className="h-4 w-4 mr-2" />
              New Trip
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Trip List</span>
              <Badge variant="secondary">
                {totalCount} total trip{totalCount !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingTrips && trips.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : trips.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-muted-foreground mb-4">
                  No trips yet. Create your first trip to group your dives!
                </div>
                <Button asChild>
                  <Link href="/trips/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Trip
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
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
                        <TableCell>{trip.location || "-"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/trips/${trip.uuid}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/trips/${trip.uuid}/edit`}>
                                <Edit className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTrip(trip.uuid)}
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
              </div>
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
    </div>
  );
}
