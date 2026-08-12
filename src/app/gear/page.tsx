"use client";

import { useCallback, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { usePaginatedResource } from "@/hooks/usePaginatedResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { gearAPI, gearItemLabel, GearItem, GearSet } from "@/lib/api/gear";
import { getApiErrorMessage } from "@/lib/api/error";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageSpinner } from "@/components/ui/page-spinner";
import { useToast } from "@/components/ui/use-toast";
import { GearItemDialog } from "@/components/gear/gear-item-dialog";
import { GearSetDialog } from "@/components/gear/gear-set-dialog";
import { GearItemsCard } from "@/components/gear/gear-items-card";
import { GearSetsCard } from "@/components/gear/gear-sets-card";
import { Plus } from "lucide-react";

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
    totalCount: itemsTotal,
    currentPage: itemsPage,
    itemsPerPage: itemsPerPage,
    hasMore: itemsHaveMore,
    fetchPage: fetchItemsPage,
    refetch: refetchItems,
  } = usePaginatedResource<GearItem>(fetchGearItems, {
    enabled: !!user,
    errorMessage: "Failed to load gear. Please try again.",
  });

  const {
    items: gearSets,
    isLoading: isLoadingSets,
    totalCount: setsTotal,
    currentPage: setsPage,
    itemsPerPage: setsPerPage,
    hasMore: setsHaveMore,
    fetchPage: fetchSetsPage,
    refetch: refetchSets,
  } = usePaginatedResource<GearSet>(fetchGearSets, {
    enabled: !!user,
    errorMessage: "Failed to load gear sets. Please try again.",
  });

  // Deleting an item can change what a set contains, so both lists are refreshed.
  const refetchAll = useCallback(() => {
    refetchItems();
    refetchSets();
  }, [refetchItems, refetchSets]);

  const {
    deletingId: deletingItemId,
    pendingId: pendingItemId,
    confirmMessage: itemConfirmMessage,
    requestDelete: requestDeleteItem,
    cancelDelete: cancelDeleteItem,
    confirmDelete: confirmDeleteItem,
  } = useDeleteResource(gearAPI.deleteGearItem, {
    confirmMessage:
      "Are you sure you want to delete this gear? Dives you already logged it on keep showing it. To retire gear without touching your log, archive it instead.",
    successMessage: "Gear deleted successfully.",
    errorMessage: "Failed to delete gear. Please try again.",
    onDeleted: refetchAll,
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
    onDeleted: refetchSets,
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gear</h1>
          <p className="text-muted-foreground mt-2">
            Track the equipment you dive with, and group it into sets you can
            load into a dive in one click
          </p>
        </div>
        <Button onClick={() => setEditingItem(undefined)}>
          <Plus className="h-4 w-4 mr-2" />
          New Gear
        </Button>
      </div>

      <GearItemsCard
        items={gearItems}
        isLoading={isLoadingItems}
        totalCount={itemsTotal}
        currentPage={itemsPage}
        itemsPerPage={itemsPerPage}
        hasMore={itemsHaveMore}
        onPageChange={fetchItemsPage}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        onCreate={() => setEditingItem(undefined)}
        onEdit={setEditingItem}
        onArchiveToggle={handleArchiveToggle}
        isArchiving={isArchiving}
        deletingId={deletingItemId}
        onDelete={requestDeleteItem}
      />

      <GearSetsCard
        sets={gearSets}
        isLoading={isLoadingSets}
        totalCount={setsTotal}
        currentPage={setsPage}
        itemsPerPage={setsPerPage}
        hasMore={setsHaveMore}
        onPageChange={fetchSetsPage}
        onCreate={() => setEditingSet(undefined)}
        onEdit={setEditingSet}
        deletingId={deletingSetId}
        onDelete={requestDeleteSet}
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
        onSaved={refetchSets}
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
    </div>
  );
}
