"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useResource } from "@/hooks/useResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { divesAPI, Dive } from "@/lib/api/dives";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { coursesAPI, Course } from "@/lib/api/courses";
import { DiveDateNav } from "@/components/dives/dive-date-nav";
import { DiveDetailProvider } from "@/components/dives/dive-detail-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { DetailPageSkeleton } from "@/components/ui/page-skeleton";
import { NotFoundState } from "@/components/ui/not-found-state";
import { Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/page-spinner";

/**
 * The dive detail page's frame: it fetches the dive, and renders the header and
 * the delete flow around whatever the page below draws with it.
 *
 * **A layout, and specifically one in a route group above `[id]`, because that is
 * the only position in the tree that survives a step of the prev/next pager.** The
 * App Router keys a dynamic segment on its param value, so everything under
 * `dives/[id]` - the page included - is torn down and rebuilt when the uuid
 * changes. Two things the page was written to do therefore never happened: it
 * kept the outgoing dive on screen under `opacity-50` while the next one loaded
 * (it re-mounted with no dive and drew `DetailPageSkeleton` instead), and the
 * pager's single `<a>` held the keyboard focus across the step (its node went
 * with the page, dropping focus to `<body>`). `dives/(detail)/` is outside the
 * dynamic segment, so this component is re-rendered rather than re-mounted, and
 * both work as written. See "The step remounted the page..." in DECISIONS.md.
 *
 * The group is what keeps `/dives`, `/dives/new` and `/dives/[id]/edit` out of
 * it: it holds only this page, and adds nothing to any URL.
 */
export default function DiveDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  // Both stored with the uuid they were looked up for, and read back only while
  // the dive on screen still names that uuid - the same shape, and for the same
  // reason, as `DiveDateNav`'s neighbours. This state now outlives a step, so
  // held plainly it would spend the second round trip after a boundary-crossing
  // step showing the *previous* dive's trip beside the new dive's everything
  // else, as a live link to it, with `isLoadingDive` already false and nothing
  // dimmed to say so. Keyed on the record rather than on the dive, so stepping
  // *within* a trip - a diver reading one front to back - keeps the row it
  // already has instead of blanking it and drawing it again. What that buys is
  // the row, not the request: the two lookups share one effect, so a step that
  // changes the course but not the trip re-fetches the trip as well. Harmless,
  // since the key still matches and nothing blanks - but it is the reason not
  // to read this as a cache.
  const [links, setLinks] = useState<{
    tripUuid?: string;
    trip: Trip | null;
    courseUuid?: string;
    course: Course | null;
  } | null>(null);

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

  // Once the dive has loaded, resolve the names of the two records it stores by
  // uuid alone - its trip and its training course. (Its dive site(s) come
  // embedded on the dive already.) Failures here are non-fatal: the dive page
  // still works, it just won't show that link.
  //
  // One effect running both lookups concurrently rather than two effects or two
  // awaits: they are independent, and a dive with both would otherwise pay for
  // them in series.
  //
  // Up here with the dive rather than in the page, for the same reason the fetch
  // is: held in the page, a step would reset both to null while the outgoing
  // dive is still on screen, and the sidebar would blank the two rows it fills
  // from them under a card grid that is otherwise intact.
  const tripUuid = user ? dive?.trip_uuid : undefined;
  const courseUuid = user ? dive?.course_uuid : undefined;

  useEffect(() => {
    let cancelled = false;

    const fetchLinks = async () => {
      const [tripData, courseData] = await Promise.all([
        tripUuid
          ? tripsAPI.getTrip(tripUuid).catch((error) => {
              console.error("Failed to fetch trip:", error);
              return null;
            })
          : null,
        courseUuid
          ? coursesAPI.getCourse(courseUuid).catch((error) => {
              console.error("Failed to fetch course:", error);
              return null;
            })
          : null,
      ]);

      if (cancelled) return;
      setLinks({
        tripUuid,
        trip: tripData,
        courseUuid,
        course: courseData,
      });
    };

    fetchLinks();

    return () => {
      cancelled = true;
    };
  }, [tripUuid, courseUuid]);

  // Null while a lookup for *this* dive's trip or course is still in flight -
  // the row is missing for a round trip rather than describing the dive before
  // it, which is the same trade the dead-until-known arrows make.
  const trip = links && links.tripUuid === tripUuid ? links.trip : null;
  const course = links && links.courseUuid === courseUuid ? links.course : null;

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  // Only the *first* load stands the page in. Stepping to a neighbouring dive
  // with the header's arrows is a same-route id change, which flips
  // `isLoadingDive` again while `useResource` still holds the dive being left -
  // and this component staying mounted across the step is what makes that hold
  // worth anything.
  if (isLoadingDive && !dive) {
    return <DetailPageSkeleton backHref="/dives" backLabel="Back to Dives" />;
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

      <DiveDetailProvider
        value={{ dive, isLoading: isLoadingDive, trip, course, refreshDive }}
      >
        {children}
      </DiveDetailProvider>
    </div>
  );
}
