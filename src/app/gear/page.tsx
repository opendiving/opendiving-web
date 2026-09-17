"use client";

import { useCallback, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useNearViewport } from "@/hooks/useNearViewport";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { gearAPI, gearItemLabel, GearItem, GearSet } from "@/lib/api/gear";
import { getApiErrorMessage } from "@/lib/api/error";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageSpinner } from "@/components/ui/page-spinner";
import { useToast } from "@/components/ui/use-toast";
import { GearItemDialog } from "@/components/gear/gear-item-dialog";
import { GearSetDialog } from "@/components/gear/gear-set-dialog";
import { GearPageFrame } from "@/components/gear/gear-page-frame";

export default function GearPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const { toast } = useToast();

  const [showArchived, setShowArchived] = useState(false);
  // `null` = the dialog is closed; an item = editing it; `undefined` = creating.
  const [editingItem, setEditingItem] = useState<GearItem | null | undefined>(
    null,
  );
  const [editingSet, setEditingSet] = useState<GearSet | null | undefined>(
    null,
  );
  const [archivingItem, setArchivingItem] = useState<GearItem | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  const fetchGearItems = useCallback(
    (page: number, perPage: number) => {
      if (!user) return Promise.reject(new Error("Not authenticated"));
      return gearAPI.getGearItems(user.uuid, page, perPage, showArchived);
    },
    [user, showArchived],
  );

  const fetchGearSets = useCallback(
    (page: number, perPage: number) => {
      if (!user) return Promise.reject(new Error("Not authenticated"));
      return gearAPI.getGearSets(user.uuid, page, perPage);
    },
    [user],
  );

  const {
    items: gearItems,
    isLoading: isLoadingItems,
    isLoadingMore: isLoadingMoreItems,
    totalCount: itemsTotal,
    itemsPerPage: itemsPerPage,
    hasMore: itemsHaveMore,
    loadFailed: itemsFailed,
    loadMore: loadMoreItems,
    reload: reloadItems,
    removeItem: dropItem,
  } = useInfiniteResource<GearItem>(fetchGearItems, {
    keyOf: (item) => item.uuid,
    enabled: !!user,
    errorMessage: "Failed to load gear. Please try again.",
  });

  // The sets card sits below the gear list and reads as its continuation, so it
  // waits until the diver is close to it before asking for anything. For most
  // divers that is still on mount - ten gear items leaves the card on screen
  // straight away - and for one with a few hundred it is what makes the two
  // lists load in the order they are read, rather than the lower one fetching a
  // page nobody has scrolled to yet.
  const [setsCardRef, setsCardIsNear] = useNearViewport<HTMLDivElement>({
    once: true,
  });

  const {
    items: gearSets,
    isLoading: isLoadingSets,
    isLoadingMore: isLoadingMoreSets,
    totalCount: setsTotal,
    itemsPerPage: setsPerPage,
    hasMore: setsHaveMore,
    loadFailed: setsFailed,
    loadMore: loadMoreSets,
    reload: reloadSets,
    removeItem: dropSet,
  } = useInfiniteResource<GearSet>(fetchGearSets, {
    keyOf: (set) => set.uuid,
    enabled: !!user && setsCardIsNear,
    errorMessage: "Failed to load gear sets. Please try again.",
  });

  // For the two paths that change an item without removing it - archiving, which
  // moves the row in or out of the filtered list, and a save, which can create a
  // row that belongs anywhere in it. Neither can be applied in place, and both
  // can change what a set names, so both lists are read again. The delete path
  // does *not* come through here; it drops its own row and re-reads only the
  // sets.
  const refetchAll = useCallback(() => {
    reloadItems();
    reloadSets();
  }, [reloadItems, reloadSets]);

  const {
    deletingId: deletingItemId,
    pendingId: pendingItemId,
    confirmMessage: itemConfirmMessage,
    requestDelete: requestDeleteItem,
    cancelDelete: cancelDeleteItem,
    confirmDelete: confirmDeleteItem,
  } = useDeleteResource(gearAPI.deleteGearItem, {
    confirmMessage:
      "Deleting removes this gear from your dives and gear sets. To keep it in your log and its service history, archive it instead. Either way, its service reminders stop.",
    successMessage: "Gear deleted successfully.",
    errorMessage: "Failed to delete gear. Please try again.",
    // Its own row goes locally, so the diver keeps their place in a long gear
    // list - but the sets below are re-read, because the item that went was a
    // member of an unknown number of them and each now names one fewer.
    onDeleted: (id) => {
      dropItem(id);
      reloadSets();
    },
  });

  const {
    deletingId: deletingSetId,
    pendingId: pendingSetId,
    confirmMessage: setConfirmMessage,
    requestDelete: requestDeleteSet,
    cancelDelete: cancelDeleteSet,
    confirmDelete: confirmDeleteSet,
  } = useDeleteResource(gearAPI.deleteGearSet, {
    confirmMessage:
      "Are you sure you want to delete this gear set? The gear in it, and the dives it was used on, are not affected.",
    successMessage: "Gear set deleted successfully.",
    errorMessage: "Failed to delete gear set. Please try again.",
    // Only the set's own row changes, so it goes locally and the diver keeps
    // their place - unlike deleting an *item*, which rewrites sets above.
    onDeleted: dropSet,
  });

  const toggleArchived = async (item: GearItem) => {
    try {
      setIsArchiving(true);
      await gearAPI.updateGearItem(item.uuid, {
        is_archived: !item.is_archived,
      });
      toast({
        title: "Success",
        description: item.is_archived
          ? "Gear unarchived."
          : "Gear archived. It stays on your logged dives but won't be offered for new ones.",
      });
      refetchAll();
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
      setArchivingItem(null);
    }
  };

  // The row the delete dialog is open for. It only ever names an item currently on
  // screen, since that is where `requestDelete` was clicked from.
  const pendingItem =
    gearItems.find((item) => item.uuid === pendingItemId) ?? null;

  // Archiving asks first - it changes what the dive form offers - while unarchiving is
  // immediately reversible and doesn't.
  const handleArchiveToggle = (item: GearItem) => {
    if (item.is_archived) {
      toggleArchived(item);
    } else {
      setArchivingItem(item);
    }
  };

  if (isAuthLoading) {
    return <PageSpinner />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  return (
    <>
      <GearPageFrame
        onNew={() => setEditingItem(undefined)}
        setsCardRef={setsCardRef}
        items={{
          items: gearItems,
          isLoading: isLoadingItems,
          isLoadingMore: isLoadingMoreItems,
          hasFailed: itemsFailed,
          totalCount: itemsTotal,
          itemsPerPage,
          hasMore: itemsHaveMore,
          onLoadMore: loadMoreItems,
          showArchived,
          onShowArchivedChange: setShowArchived,
          onCreate: () => setEditingItem(undefined),
          onEdit: setEditingItem,
          onArchiveToggle: handleArchiveToggle,
          isArchiving,
          deletingId: deletingItemId,
          onDelete: requestDeleteItem,
        }}
        sets={{
          sets: gearSets,
          isLoading: isLoadingSets,
          isLoadingMore: isLoadingMoreSets,
          hasFailed: setsFailed,
          totalCount: setsTotal,
          itemsPerPage: setsPerPage,
          hasMore: setsHaveMore,
          onLoadMore: loadMoreSets,
          onCreate: () => setEditingSet(undefined),
          onEdit: setEditingSet,
          deletingId: deletingSetId,
          onDelete: requestDeleteSet,
        }}
      />

      <GearItemDialog
        userId={user?.uuid ?? ""}
        open={editingItem !== null}
        onOpenChange={(open) => !open && setEditingItem(null)}
        gearItem={editingItem}
        onSaved={refetchAll}
      />

      <GearSetDialog
        userId={user?.uuid ?? ""}
        open={editingSet !== null}
        onOpenChange={(open) => !open && setEditingSet(null)}
        gearSet={editingSet}
        onSaved={reloadSets}
      />

      <ConfirmDialog
        open={archivingItem !== null}
        onOpenChange={(open) => !open && setArchivingItem(null)}
        title="Archive gear"
        description={
          archivingItem
            ? `"${gearItemLabel(archivingItem)}" will stay on the ${archivingItem.dive_count} dive${
                archivingItem.dive_count === 1 ? "" : "s"
              } it's already logged on, but won't be offered when logging new ones.`
            : undefined
        }
        confirmText="Archive"
        variant="default"
        isLoading={isArchiving}
        onConfirm={() => {
          if (archivingItem) toggleArchived(archivingItem);
        }}
      />

      <ConfirmDialog
        open={pendingItemId !== null}
        onOpenChange={(open) => !open && cancelDeleteItem()}
        title="Delete gear"
        description={itemConfirmMessage}
        confirmText="Delete"
        isLoading={deletingItemId === pendingItemId}
        // Offered only for gear that isn't archived already - `toggleArchived`
        // would otherwise *un*archive it, which is the opposite of what the
        // button says. Archived items are reachable here via "Show archived".
        secondaryAction={
          pendingItem && !pendingItem.is_archived
            ? {
                label: "Archive instead",
                onClick: () => {
                  // Straight to the archive, without the confirmation
                  // `handleArchiveToggle` would open: the diver is already
                  // reading one, and it says what this does.
                  cancelDeleteItem();
                  toggleArchived(pendingItem);
                },
              }
            : undefined
        }
        onConfirm={confirmDeleteItem}
      />

      <ConfirmDialog
        open={pendingSetId !== null}
        onOpenChange={(open) => !open && cancelDeleteSet()}
        title="Delete gear set"
        description={setConfirmMessage}
        confirmText="Delete"
        isLoading={deletingSetId === pendingSetId}
        onConfirm={confirmDeleteSet}
      />
    </>
  );
}
