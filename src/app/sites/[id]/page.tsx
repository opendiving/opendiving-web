"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useResource } from "@/hooks/useResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import { formatDateTime } from "@/lib/date-time";
import { formatCoordinates } from "@/lib/validations/dive-site";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { DiveSiteDialog } from "@/components/sites/dive-site-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { DetailPageSkeleton } from "@/components/ui/page-skeleton";
import { NotFoundState } from "@/components/ui/not-found-state";
import { Edit, Trash2, Plus, MapPin, Loader2 } from "lucide-react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/page-spinner";

// The plain-delete toast, and the first half of the one a move gets - "moved to
// Blue Hole" is an addition to what happened, not a replacement for it.
const DELETED_MESSAGE = "Dive site deleted successfully.";

export default function DiveSiteDetailPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const {
    resource: diveSite,
    setResource: setDiveSite,
    isLoading: isLoadingDiveSite,
  } = useResource<DiveSite>(diveSitesAPI.getDiveSite, {
    enabled: !!user,
    errorMessage: "Failed to load dive site details. Please try again.",
    redirectTo: "/sites",
  });

  const del = useDeleteResource(diveSitesAPI.deleteDiveSite, {
    successMessage: DELETED_MESSAGE,
    errorMessage: "Failed to delete dive site. Please try again.",
    onDeleted: () => router.push("/sites"),
  });
  const isDeleting = del.deletingId !== null;

  const formatDate = (dateString: string) =>
    formatDateTime(dateString, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingDiveSite) {
    return (
      <DetailPageSkeleton backHref="/sites" backLabel="Back to dive sites" />
    );
  }

  if (!diveSite) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NotFoundState
          message="Dive site not found."
          backHref="/sites"
          backLabel="Back to dive sites"
        />
      </div>
    );
  }

  const coordinates = formatCoordinates(diveSite.latitude, diveSite.longitude);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader
        backHref="/sites"
        backLabel="Back to dive sites"
        title={diveSite.name}
        subtitle={diveSite.location?.name ?? undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="destructive"
              onClick={() => del.requestDelete(diveSite.uuid)}
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

      <DiveSiteDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        diveSite={diveSite}
        onSaved={setDiveSite}
      />

      <DeleteWithReassignDialog
        kind="dive-site"
        targetId={del.pendingId}
        isDeleting={isDeleting}
        onCancel={del.cancelDelete}
        onConfirm={(moveDivesTo, name) =>
          del.confirmDelete(
            moveDivesTo,
            name ? `${DELETED_MESSAGE} Its dives moved to ${name}.` : undefined,
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentDivesCard
            complete
            enabled={!!user}
            diveSiteId={diveSite.uuid}
            title="Dives at this Site"
            description="All dives logged at this dive site"
            viewAllHref={null}
            emptyTitle="No dives logged at this site yet"
            emptyDescription="Log a dive and assign it to this dive site to see it here."
            newDiveHref={`/dives/new?dive_site_uuid=${diveSite.uuid}`}
            newDiveLabel="Log a dive at this site"
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Dive Site Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {diveSite.location?.name && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Location
                  </div>
                  <div className="text-sm">{diveSite.location.name}</div>
                </div>
              )}
              {coordinates && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Coordinates
                  </div>
                  <div className="text-sm tabular-nums">{coordinates}</div>
                </div>
              )}

              {/* Gated on the same both-or-neither pair the coordinates line
                  is, so a site with no position costs nothing - not even the
                  map's chunk. The map itself would draw nothing either way. */}
              {coordinates && (
                <LocationsMap
                  locations={[
                    {
                      name: diveSite.name,
                      latitude: diveSite.latitude,
                      longitude: diveSite.longitude,
                    },
                  ]}
                  subject="the dive site"
                />
              )}
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Added on
                </div>
                <div className="text-sm">{formatDate(diveSite.created_at)}</div>
              </div>
              <Button className="w-full" asChild>
                <Link href={`/dives/new?dive_site_uuid=${diveSite.uuid}`}>
                  <Plus className="h-4 w-4 mr-2" />
                  Log a dive
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
