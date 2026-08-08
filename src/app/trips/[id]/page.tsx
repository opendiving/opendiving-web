"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { formatDateTime, formatTripDateRange } from "@/lib/date-time";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { NotFoundState } from "@/components/ui/not-found-state";
import {
  Edit,
  Trash2,
  Plus,
  Calendar,
  MapPin,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

export default function TripDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const { toast } = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [isLoadingTrip, setIsLoadingTrip] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const tripId = params.id as string;

  // Fetch trip details
  useEffect(() => {
    const fetchTrip = async () => {
      if (!user || !tripId) return;

      try {
        setIsLoadingTrip(true);
        const tripData = await tripsAPI.getTrip(tripId);
        setTrip(tripData);
      } catch (error) {
        console.error("Failed to fetch trip:", error);
        toast({
          title: "Error",
          description: "Failed to load trip details. Please try again.",
          variant: "destructive",
        });
        router.push("/trips");
      } finally {
        setIsLoadingTrip(false);
      }
    };

    if (user) {
      fetchTrip();
    }
  }, [user, tripId, toast, router]);

  // Handle trip deletion
  const handleDeleteTrip = async () => {
    if (!user || !trip?.uuid) return;

    try {
      setIsDeleting(true);
      await tripsAPI.deleteTrip(trip.uuid);

      toast({
        title: "Success",
        description: "Trip deleted successfully.",
      });

      router.push("/trips");
    } catch (error) {
      console.error("Failed to delete trip:", error);
      toast({
        title: "Error",
        description: "Failed to delete trip. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setIsConfirmOpen(false);
    }
  };

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
          trip.location && tripDateRange
            ? `${trip.location} · ${tripDateRange}`
            : trip.location
              ? trip.location
              : tripDateRange
                ? tripDateRange
                : `Created ${formatDate(trip.created_at)}`
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/trips/${trip.uuid}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
            <Button
              variant="destructive"
              onClick={() => setIsConfirmOpen(true)}
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

      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title="Delete trip"
        description="Are you sure you want to delete this trip? This action cannot be undone."
        confirmText="Delete"
        isLoading={isDeleting}
        onConfirm={handleDeleteTrip}
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
              {trip.location && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Location
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {trip.location}
                  </div>
                </div>
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
