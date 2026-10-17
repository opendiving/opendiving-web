import { GearItem } from "@/lib/api/gear";
import { Button } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/count-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { PlainCardList } from "@/components/ui/plain-card";
import { GearItemCard } from "@/components/gear/gear-item-card";
import { Backpack, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export interface GearItemsListProps {
  items: GearItem[];
  isLoading: boolean;
  /** True while a further page is in flight, as opposed to the first. */
  isLoadingMore: boolean;
  /** True when the last attempt failed, stopping the load-on-scroll. */
  hasFailed: boolean;
  totalCount: number;
  itemsPerPage: number;
  hasMore: boolean;
  onLoadMore: () => void;
  showArchived: boolean;
  /** Whether archived gear exists that the list, with `showArchived` off, leaves out. */
  hasArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  onCreate: () => void;
  onEdit: (item: GearItem) => void;
  /** Archiving is confirmed first, unarchiving is immediate — the caller owns that split,
   * since only it can open the confirm dialog. */
  onArchiveToggle: (item: GearItem) => void;
  isArchiving: boolean;
  deletingId: string | null;
  onDelete: (uuid: string) => void;
}

/**
 * The gear list: the Show archived switch and the count in its header, and a card per
 * item inside it, as the life list holds its species.
 *
 * The empty state differs by filter — "no gear at all" and "no *active* gear" need
 * different advice, since the second is fixed by ticking Show archived rather than by
 * adding anything. No gear at all also drops the header down to its hidden heading, as
 * `ListCardHeader` does for a one-list page; no active gear keeps it for the switch.
 */
export function GearItemsList({
  items,
  isLoading,
  isLoadingMore,
  hasFailed,
  totalCount,
  itemsPerPage,
  hasMore,
  onLoadMore,
  showArchived,
  hasArchived,
  onShowArchivedChange,
  onCreate,
  onEdit,
  onArchiveToggle,
  isArchiving,
  deletingId,
  onDelete,
}: GearItemsListProps) {
  const isEmpty = !isLoading && items.length === 0;
  const hasNoGear = isEmpty && !hasArchived;

  return (
    <Card>
      <CardHeader className={cn(hasNoGear && "p-0")}>
        {hasNoGear ? (
          <CardTitle as="h2" className="sr-only">
            Your Gear
          </CardTitle>
        ) : (
          <CardTitle
            as="h2"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <Backpack className="h-5 w-5" />
              Your Gear
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="show-archived"
                  checked={showArchived}
                  onCheckedChange={onShowArchivedChange}
                />
                <Label
                  htmlFor="show-archived"
                  className="cursor-pointer text-sm font-normal text-muted-foreground"
                >
                  Show archived
                </Label>
              </div>
              <CountBadge
                count={totalCount}
                isLoading={isLoading}
                label="item"
              />
            </div>
          </CardTitle>
        )}
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            icon={Backpack}
            title={hasNoGear ? "No gear yet" : "No active gear"}
            description={
              hasNoGear
                ? "Add your first piece of kit to start tracking what you dive with!"
                : "Add a piece of kit, or turn on “Show archived” to see gear you've retired."
            }
            action={
              <Button onClick={onCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add your first gear
              </Button>
            }
          />
        ) : (
          <PlainCardList placeholders={itemsPerPage}>
            {items.map((item) => (
              <GearItemCard
                key={item.uuid}
                item={item}
                onEdit={() => onEdit(item)}
                onArchiveToggle={() => onArchiveToggle(item)}
                isArchiving={isArchiving}
                onDelete={() => onDelete(item.uuid)}
                isDeleting={deletingId === item.uuid}
              />
            ))}
          </PlainCardList>
        )}

        <LoadMoreTrigger
          hasMore={hasMore}
          isLoading={isLoadingMore}
          hasFailed={hasFailed}
          loadedCount={items.length}
          totalCount={totalCount}
          itemsPerPage={itemsPerPage}
          itemLabel="gear items"
          onLoadMore={onLoadMore}
        />
      </CardContent>
    </Card>
  );
}
