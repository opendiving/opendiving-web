"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useResource } from "@/hooks/useResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import {
  gearAPI,
  GearItem,
  gearItemLabel,
  gearTypeLabel,
} from "@/lib/api/gear";
import { getApiErrorMessage } from "@/lib/api/error";
import { formatDateTime } from "@/lib/date-time";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { GearItemDialog } from "@/components/gear/gear-item-dialog";
import { GearServiceCard } from "@/components/gear/gear-service-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { PageSpinner } from "@/components/ui/page-spinner";
import { DetailPageSkeleton } from "@/components/ui/page-skeleton";
import { NotFoundState } from "@/components/ui/not-found-state";
import {
  Edit,
  Trash2,
  Backpack,
  Archive,
  ArchiveRestore,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function GearItemDetailPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const { toast } = useToast();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);

  const {
    resource: gearItem,
    setResource: setGearItem,
    isLoading: isLoadingGear,
    refetch: loadGearItem,
  } = useResource<GearItem>(gearAPI.getGearItem, {
    enabled: !!user,
    errorMessage: "Failed to load gear details. Please try again.",
    redirectTo: "/gear",
  });

  const del = useDeleteResource(gearAPI.deleteGearItem, {
    confirmMessage:
      "Deleting removes this gear from your dives and gear sets. To keep it in your log and its service history, archive it instead. Either way, its service reminders stop.",
    successMessage: "Gear deleted successfully.",
    errorMessage: "Failed to delete gear. Please try again.",
    onDeleted: () => router.push("/gear"),
  });
  const isDeleting = del.deletingId !== null;

  const handleToggleArchived = async () => {
    if (!gearItem) return;

    try {
      setIsArchiving(true);
      await gearAPI.updateGearItem(gearItem.uuid, {
        is_archived: !gearItem.is_archived,
      });
      await loadGearItem();
      toast({
        title: "Success",
        description: gearItem.is_archived
          ? "Gear unarchived."
          : "Gear archived. It stays on your logged dives but won't be offered for new ones.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to update gear. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsArchiving(false);
      setIsArchiveConfirmOpen(false);
    }
  };

  if (isAuthLoading) {
    return <PageSpinner />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingGear) {
    return <DetailPageSkeleton backHref="/gear" backLabel="Back to Gear" />;
  }

  if (!gearItem) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NotFoundState
          message="Gear not found."
          backHref="/gear"
          backLabel="Back to Gear"
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader
        backHref="/gear"
        backLabel="Back to Gear"
        title={gearItem.name}
        subtitle={gearItem.brand ?? undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="outline"
              disabled={isArchiving}
              onClick={() =>
                gearItem.is_archived
                  ? handleToggleArchived()
                  : setIsArchiveConfirmOpen(true)
              }
            >
              {gearItem.is_archived ? (
                <ArchiveRestore className="h-4 w-4 mr-2" />
              ) : (
                <Archive className="h-4 w-4 mr-2" />
              )}
              {gearItem.is_archived ? "Unarchive" : "Archive"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => del.requestDelete(gearItem.uuid)}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Above the dive list on purpose: service is the thing you can act on
              from this page, the dive list is reference. */}
          <GearServiceCard
            gearItem={gearItem}
            onChanged={() => {
              // Refetches the item so its embedded `service` summaries (and so the
              // header's badge) pick up the new due dates. Failures are logged
              // rather than surfaced - the card has already toasted the real error.
              loadGearItem().catch((error) =>
                console.error("Failed to reload gear:", error),
              );
            }}
          />

          <RecentDivesCard
            complete
            enabled={!!user}
            gearItemId={gearItem.uuid}
            title="Dives with this Gear"
            description="Every dive this item was used on"
            viewAllHref={null}
            emptyTitle="Not used on any dive yet"
            emptyDescription="Add this item to a dive's gear list to see it here."
            newDiveLabel="Log a Dive"
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Backpack className="h-5 w-5" />
                Gear Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Dives
                </div>
                <div className="text-2xl font-bold tabular-nums">
                  {gearItem.dive_count}
                </div>
              </div>

              {(gearItem.rented || gearItem.is_archived) && (
                <div className="flex flex-wrap gap-2">
                  {gearItem.rented && <Badge variant="secondary">Rented</Badge>}
                  {gearItem.is_archived && (
                    <Badge variant="outline">Archived</Badge>
                  )}
                </div>
              )}

              {gearItem.type && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Type
                  </div>
                  <div className="text-sm">{gearTypeLabel(gearItem.type)}</div>
                </div>
              )}

              {gearItem.brand && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Brand
                  </div>
                  <div className="text-sm">{gearItem.brand}</div>
                </div>
              )}

              {gearItem.notes && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Notes
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                    {gearItem.notes}
                  </p>
                </div>
              )}

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Added on
                </div>
                <div className="text-sm">
                  {formatDateTime(gearItem.created_at, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <GearItemDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        gearItem={gearItem}
        onSaved={setGearItem}
      />

      <ConfirmDialog
        open={isArchiveConfirmOpen}
        onOpenChange={setIsArchiveConfirmOpen}
        title="Archive gear"
        description={`"${gearItemLabel(gearItem)}" will stay on the ${gearItem.dive_count} dive${
          gearItem.dive_count === 1 ? "" : "s"
        } it's already logged on, but won't be offered when logging new ones.`}
        confirmText="Archive"
        variant="default"
        isLoading={isArchiving}
        onConfirm={handleToggleArchived}
      />

      <ConfirmDialog
        open={del.pendingId !== null}
        onOpenChange={(open) => !open && del.cancelDelete()}
        title="Delete gear"
        description={del.confirmMessage}
        confirmText="Delete"
        isLoading={isDeleting}
        // Offered only while the item isn't archived - `handleToggleArchived`
        // would otherwise *un*archive it, which is the opposite of what the
        // button says.
        secondaryAction={
          gearItem.is_archived
            ? undefined
            : {
                label: "Archive instead",
                onClick: () => {
                  // Straight to the archive, skipping the separate archive
                  // confirmation: the diver is already reading one, and it says
                  // what this does.
                  del.cancelDelete();
                  handleToggleArchived();
                },
              }
        }
        onConfirm={del.confirmDelete}
      />
    </div>
  );
}
