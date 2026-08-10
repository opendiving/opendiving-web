"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { usePaginatedResource } from "@/hooks/usePaginatedResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import {
  gearAPI,
  GearItem,
  GearSet,
  gearItemLabel,
  gearTypeLabel,
} from "@/lib/api/gear";
import { getApiErrorMessage } from "@/lib/api/error";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageSpinner } from "@/components/ui/page-spinner";
import { useToast } from "@/components/ui/use-toast";
import { GearItemDialog } from "@/components/gear/gear-item-dialog";
import { GearSetDialog } from "@/components/gear/gear-set-dialog";
import { ServiceStatusBadge } from "@/components/gear/service-status-badge";
import { worstServiceStatus } from "@/lib/gear-service";
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  Archive,
  ArchiveRestore,
} from "lucide-react";

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
    } catch (error: any) {
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

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>Your Gear</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-archived"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                <Label
                  htmlFor="show-archived"
                  className="cursor-pointer text-sm font-normal text-muted-foreground"
                >
                  Show archived
                </Label>
              </div>
              <Badge variant="secondary">
                {itemsTotal} item{itemsTotal !== 1 ? "s" : ""}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingItems && gearItems.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : gearItems.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                {showArchived
                  ? "No gear yet. Add your first piece of kit to start tracking what you dive with!"
                  : "No active gear. Add a piece of kit, or tick “Show archived” to see gear you've retired."}
              </div>
              <Button onClick={() => setEditingItem(undefined)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Gear
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Dives</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gearItems.map((item) => (
                    <TableRow key={item.uuid}>
                      <TableCell className="font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/gear/${item.uuid}`}
                            className="hover:underline"
                          >
                            {item.name}
                          </Link>
                          {item.rented && (
                            <Badge variant="secondary">Rented</Badge>
                          )}
                          {item.is_archived && (
                            <Badge variant="outline">Archived</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {gearTypeLabel(item.type) ?? (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{item.brand || "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.dive_count}
                      </TableCell>
                      {/* No extra fetch - the API embeds each item's schedules, and
                          the status is derived from them in the browser. */}
                      <TableCell>
                        <ServiceStatusBadge
                          status={worstServiceStatus(
                            item.service ?? [],
                            item.dive_count,
                          )}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Edit"
                            onClick={() => setEditingItem(item)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={
                              item.is_archived ? "Unarchive" : "Archive"
                            }
                            disabled={isArchiving}
                            onClick={() =>
                              item.is_archived
                                ? toggleArchived(item)
                                : setArchivingItem(item)
                            }
                          >
                            {item.is_archived ? (
                              <ArchiveRestore className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Delete"
                            onClick={() => requestDeleteItem(item.uuid)}
                            disabled={deletingItemId === item.uuid}
                          >
                            {deletingItemId === item.uuid ? (
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
            currentPage={itemsPage}
            itemsPerPage={itemsPerPage}
            totalCount={itemsTotal}
            hasMore={itemsHaveMore}
            isLoading={isLoadingItems}
            itemLabel="gear items"
            onPageChange={fetchItemsPage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>Gear Sets</span>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">
                {setsTotal} set{setsTotal !== 1 ? "s" : ""}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingSet(undefined)}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Set
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingSets && gearSets.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : gearSets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No gear sets yet. Group the kit you use together — sidemount,
              tech, warm water — and load it into a dive in one click.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Gear</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gearSets.map((set) => (
                    <TableRow key={set.uuid}>
                      <TableCell className="font-medium">{set.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {set.gear_items.length === 0
                          ? "Empty"
                          : set.gear_items.map(gearItemLabel).join(", ")}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {set.weight != null ? `${set.weight} kg` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Edit"
                            onClick={() => setEditingSet(set)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Delete"
                            onClick={() => requestDeleteSet(set.uuid)}
                            disabled={deletingSetId === set.uuid}
                          >
                            {deletingSetId === set.uuid ? (
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
            currentPage={setsPage}
            itemsPerPage={setsPerPage}
            totalCount={setsTotal}
            hasMore={setsHaveMore}
            isLoading={isLoadingSets}
            itemLabel="gear sets"
            onPageChange={fetchSetsPage}
          />
        </CardContent>
      </Card>

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
