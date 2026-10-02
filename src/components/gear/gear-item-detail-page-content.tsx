"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useResource } from "@/hooks/useResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useReturnTo } from "@/hooks/useReturnTo";
import { gearAPI, GearItem, gearItemLabel } from "@/lib/api/gear";
import { getApiErrorMessage } from "@/lib/api/error";
import { cn } from "@/lib/utils";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { GearItemDialog } from "@/components/gear/gear-item-dialog";
import { GearItemHero } from "@/components/gear/gear-item-hero";
import { GearServiceCard } from "@/components/gear/gear-service-card";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  DeleteMenuItem,
  ItemActionsMenu,
} from "@/components/ui/item-actions-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  HERO_BODY,
  HERO_CONTROL,
  MapHeroPageSkeleton,
} from "@/components/ui/map-hero";
import { PageSpinner } from "@/components/ui/page-spinner";
import { NotFoundState } from "@/components/ui/not-found-state";
import { Edit, Backpack, Archive, ArchiveRestore } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export function GearItemDetailPageContent() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const { toast } = useToast();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const back = useReturnTo({ href: "/gear", label: "Back to gear" });

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
  useDocumentTitle(gearItem?.name, "Gear");

  const del = useDeleteResource(gearAPI.deleteGearItem, {
    confirmMessage:
      "Deleting removes this gear from your dives and gear sets. To keep it in your log and its service history, archive it instead. Either way, its service reminders stop.",
    successMessage: "Gear deleted successfully.",
    errorMessage: "Failed to delete gear. Please try again.",
    onDeleted: () => router.push(back.href),
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
    return (
      <MapHeroPageSkeleton
        plain
        backHref={back.href}
        backLabel={back.label}
        icon={Backpack}
      />
    );
  }

  if (!gearItem) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
        <NotFoundState
          message="Gear not found."
          backHref={back.href}
          backLabel={back.label}
        />
      </div>
    );
  }

  return (
    <div>
      <GearItemHero
        gearItem={gearItem}
        back={back}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className={HERO_CONTROL}
              onClick={() => setIsEditOpen(true)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <ItemActionsMenu variant="ghost" size="sm" className={HERO_CONTROL}>
              <DropdownMenuItem
                disabled={isArchiving}
                onSelect={() =>
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
              </DropdownMenuItem>
              <DeleteMenuItem
                onSelect={() => del.requestDelete(gearItem.uuid)}
                disabled={isDeleting}
              />
            </ItemActionsMenu>
          </>
        }
      />

      <div className={cn(HERO_BODY, "grid grid-cols-1 lg:grid-cols-3 gap-6")}>
        <div className="lg:col-span-2 space-y-6">
          {/* Above the dive list on purpose: service is the thing you can act on
              from this page, the dive list is reference. */}
          <GearServiceCard
            gearItem={gearItem}
            onChanged={() => {
              // Refetches the item so its embedded `service` summaries (and so the
              // hero's next service date) pick up the new due dates. Failures are logged
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
            title="Dives with This Gear"
            description="Every dive this item was used on"
            viewAllHref={null}
            emptyTitle="Not used on any dive yet"
            emptyDescription="Add this item to a dive's gear list to see it here."
            newDiveLabel="Log a dive"
          />
        </div>

        {(gearItem.is_archived || gearItem.notes) && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle as="h2" className="flex items-center gap-2">
                  <Backpack className="h-5 w-5" />
                  Gear Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {gearItem.is_archived && (
                  <Badge variant="outline">Archived</Badge>
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
              </CardContent>
            </Card>
          </div>
        )}
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
