import Link from "next/link";
import { GearItem, gearItemLabel, gearTypeLabel } from "@/lib/api/gear";
import { worstServiceStatus } from "@/lib/gear-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { CountBadge } from "@/components/ui/count-badge";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { ServiceStatusBadge } from "@/components/gear/service-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Archive,
  ArchiveRestore,
  Backpack,
  Edit,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export interface GearItemsCardProps {
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
 * The gear list: one row per item, with its service status and the row actions.
 *
 * The empty state differs by filter — "no gear at all" and "no *active* gear" need
 * different advice, since the second is fixed by ticking Show archived rather than by
 * adding anything.
 */
export function GearItemsCard({
  items,
  isLoading,
  isLoadingMore,
  hasFailed,
  totalCount,
  itemsPerPage,
  hasMore,
  onLoadMore,
  showArchived,
  onShowArchivedChange,
  onCreate,
  onEdit,
  onArchiveToggle,
  isArchiving,
  deletingId,
  onDelete,
}: GearItemsCardProps) {
  return (
    <Card>
      <CardHeader>
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
            <CountBadge count={totalCount} isLoading={isLoading} label="item" />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!isLoading && items.length === 0 ? (
          <EmptyState
            icon={Backpack}
            title={showArchived ? "No gear yet" : "No active gear"}
            description={
              showArchived
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
          <Table
            // Busy on the outside, hidden on each placeholder row within - the
            // split `ListRowsSkeleton` documents, applied here because the rows
            // themselves are `aria-hidden` and would otherwise leave a reader with
            // a table that is silently empty rather than one that is loading.
            aria-busy={items.length === 0 || undefined}
          >
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
              {items.length === 0 && (
                <TableRowsSkeleton columns={6} rows={itemsPerPage} />
              )}
              {items.map((item) => (
                <TableRow key={item.uuid}>
                  <TableCell className="font-medium">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/gear/${item.uuid}`}
                        className="hover:underline"
                      >
                        {item.name}
                      </Link>
                      {item.rented && <Badge variant="secondary">Rented</Badge>}
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
                    {/* Named per row, not per action: ten identical "Edit"s tell
                        a screen reader's controls list nothing about which piece
                        of gear. See DECISIONS.md, "Ten rows of 'Edit' name
                        nothing". */}
                    <div className="flex justify-end gap-2">
                      <IconTooltip label={`Edit ${gearItemLabel(item)}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(item)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </IconTooltip>
                      <IconTooltip
                        label={`${
                          item.is_archived ? "Unarchive" : "Archive"
                        } ${gearItemLabel(item)}`}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isArchiving}
                          onClick={() => onArchiveToggle(item)}
                        >
                          {item.is_archived ? (
                            <ArchiveRestore className="h-4 w-4" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </Button>
                      </IconTooltip>
                      <IconTooltip label={`Delete ${gearItemLabel(item)}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(item.uuid)}
                          disabled={deletingId === item.uuid}
                        >
                          {deletingId === item.uuid ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </IconTooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
