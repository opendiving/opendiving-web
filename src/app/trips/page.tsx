"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { tripsAPI, Trip, PaginatedTripsResponse } from "@/lib/api/trips";
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
import { Plus, Eye, Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

export default function TripsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [hasMore, setHasMore] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Redirect to signin if not authenticated, but only once the auth check
  // has actually finished.
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/signin');
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // Fetch trips
  const fetchTrips = async (page: number = 1) => {
    if (!user?.username) return;

    try {
      setIsLoadingTrips(true);
      const response: PaginatedTripsResponse = await tripsAPI.getTrips(
        user.username,
        page,
        itemsPerPage
      );

      setTrips(response.data);
      setTotalCount(response.total_count);
      setHasMore(response.has_more);
      setCurrentPage(page);
    } catch (error) {
      console.error('Failed to fetch trips:', error);
      toast({
        title: "Error",
        description: "Failed to load trips. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTrips(false);
    }
  };

  useEffect(() => {
    if (user?.username) {
      fetchTrips();
    }
  }, [user?.username]);

  // Handle trip deletion
  const handleDeleteTrip = async (tripId: number) => {
    if (!user?.username || !confirm('Are you sure you want to delete this trip?')) return;

    try {
      setDeletingId(tripId);
      await tripsAPI.deleteTrip(user.username, tripId);

      toast({
        title: "Success",
        description: "Trip deleted successfully.",
      });

      // Refresh the list
      await fetchTrips(currentPage);
    } catch (error) {
      console.error('Failed to delete trip:', error);
      toast({
        title: "Error",
        description: "Failed to delete trip. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateRange = (startDate?: string, endDate?: string) => {
    return formatTripDateRange(startDate, endDate, { year: 'numeric', month: 'short', day: 'numeric' }) ?? '-';
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showDashboardActions={true} currentPage="trips" />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showDashboardActions={true} currentPage="trips" />

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
                      <TableRow key={trip.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/trips/${trip.id}`}
                            className="hover:underline"
                          >
                            {trip.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {formatDateRange(trip.start_date, trip.end_date)}
                        </TableCell>
                        <TableCell>{trip.location || "-"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/trips/${trip.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/trips/${trip.id}/edit`}>
                                <Edit className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTrip(trip.id)}
                              disabled={deletingId === trip.id}
                            >
                              {deletingId === trip.id ? (
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

            {/* Pagination */}
            {totalCount > itemsPerPage && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                  {Math.min(currentPage * itemsPerPage, totalCount)} of{" "}
                  {totalCount} trips
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchTrips(currentPage - 1)}
                    disabled={currentPage === 1 || isLoadingTrips}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchTrips(currentPage + 1)}
                    disabled={!hasMore || isLoadingTrips}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
}
