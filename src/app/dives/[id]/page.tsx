"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useResource } from "@/hooks/useResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { divesAPI, Dive } from "@/lib/api/dives";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { DiveDetailMain } from "@/components/dives/dive-detail-main";
import { DiveDetailSidebar } from "@/components/dives/dive-detail-sidebar";
import { DiveDateNav } from "@/components/dives/dive-date-nav";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { NotFoundState } from "@/components/ui/not-found-state";
import { Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/page-spinner";
import { cn } from "@/lib/utils";

export default function DiveDetailPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const [trip, setTrip] = useState<Trip | null>(null);

  const {
    resource: dive,
    isLoading: isLoadingDive,
    // Re-reads the dive after something on the page changes it - currently only
    // deleting the imported file, which the dive embeds as `source_file`. It
    // leaves `isLoadingDive` alone, so the one card that changed swaps instead of
    // the whole page blanking into a spinner.
    refetch: refreshDive,
  } = useResource<Dive>(divesAPI.getDive, {
    enabled: !!user,
    errorMessage: "Failed to load dive details. Please try again.",
    redirectTo: "/dives",
  });

  const del = useDeleteResource(divesAPI.deleteDive, {
    confirmMessage:
      "Are you sure you want to delete this dive? This action cannot be undone.",
    successMessage: "Dive deleted successfully.",
    errorMessage: "Failed to delete dive. Please try again.",
    onDeleted: () => router.push("/dives"),
  });
  const isDeleting = del.deletingId !== null;

  // Once the dive has loaded, resolve its trip's name (the dive itself only
  // stores the trip's ID; its dive site(s) come embedded on the dive already).
  // Failures here are non-fatal - the dive page still works, it just won't
  // show the trip link.
  useEffect(() => {
    let cancelled = false;

    const fetchTrip = async () => {
      if (!user || !dive?.trip_uuid) {
        setTrip(null);
        return;
      }

      try {
        const tripData = await tripsAPI.getTrip(dive.trip_uuid);
        if (!cancelled) setTrip(tripData);
      } catch (error) {
        console.error("Failed to fetch trip:", error);
        if (!cancelled) setTrip(null);
      }
    };

    fetchTrip();

    return () => {
      cancelled = true;
    };
  }, [user, dive?.trip_uuid]);

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  // Only the *first* load blanks the page. Stepping to a neighbouring dive with the
  // header's arrows is a same-route id change, which flips `isLoadingDive` again while
  // `useResource` still holds the dive being left - and returning a spinner there tore
  // the whole page down mid-step, taking the arrow that was just clicked with it. What
  // the diver sees now is the dive they came from, dimmed, until the next one lands.
  if (isLoadingDive && !dive) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SectionSpinner />
      </div>
    );
  }

  if (!dive) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NotFoundState
          message="Dive not found."
          backHref="/dives"
          backLabel="Back to Dives"
        />
      </div>
    );
  }

  return (
    <div
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
      aria-busy={isLoadingDive}
    >
      <PageHeader
        backHref="/dives"
        backLabel="Back to Dives"
        title={`Dive #${dive.dive_number}`}
        // The time of day sits here with the date rather than in a card of its
        // own below: the two are one fact, and splitting them put the dive's
        // date in the header and the clock it was on two scroll positions away.
        // The arrows around it step to the chronologically adjacent dives.
        subtitle={
          <DiveDateNav diveUuid={dive.uuid} startTime={dive.start_time} />
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/dives/${dive.uuid}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
            <Button
              variant="destructive"
              onClick={() => del.requestDelete(dive.uuid)}
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
        open={del.pendingId !== null}
        onOpenChange={(open) => !open && del.cancelDelete()}
        title="Delete dive"
        description={del.confirmMessage}
        confirmText="Delete"
        isLoading={isDeleting}
        onConfirm={del.confirmDelete}
      />

      {/* Dimmed, not replaced, while the next dive loads: these cards still describe
          the dive being stepped away from, and fading them says "this is on its way
          out" without the page losing its height and scroll position. */}
      <div
        className={cn(
          "grid grid-cols-1 lg:grid-cols-3 gap-6 transition-opacity",
          isLoadingDive && "opacity-50",
        )}
      >
        <DiveDetailMain dive={dive} />
        <DiveDetailSidebar
          dive={dive}
          trip={trip}
          onSourceFileChanged={refreshDive}
        />
      </div>
    </div>
  );
}
