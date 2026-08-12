import Link from "next/link";
import { GearItem, gearTypeLabel } from "@/lib/api/gear";
import { worstServiceStatus } from "@/lib/gear-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PaginationFooter } from "@/components/ui/pagination-footer";
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
  Edit,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

interface GearItemsCardProps {
  items: GearItem[];
  isLoading: boolean;
  totalCount: number;
  currentPage: number;
  itemsPerPage: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
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
  totalCount,
  currentPage,
  itemsPerPage,
  hasMore,
  onPageChange,
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
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span>Your Gear</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-archived"
                checked={showArchived}
                onChange={(e) => onShowArchivedChange(e.target.checked)}
              />
              <Label
                htmlFor="show-archived"
                className="cursor-pointer text-sm font-normal text-muted-foreground"
              >
                Show archived
              </Label>
            </div>
            <Badge variant="secondary">
              {totalCount} item{totalCount !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              {showArchived
                ? "No gear yet. Add your first piece of kit to start tracking what you dive with!"
                : "No active gear. Add a piece of kit, or tick “Show archived” to see gear you've retired."}
            </div>
            <Button onClick={onCreate}>
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
                          onClick={() => onEdit(item)}
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
                          onClick={() => onArchiveToggle(item)}
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
                          onClick={() => onDelete(item.uuid)}
                          disabled={deletingId === item.uuid}
                        >
                          {deletingId === item.uuid ? (
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
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          totalCount={totalCount}
          hasMore={hasMore}
          isLoading={isLoading}
          itemLabel="gear items"
          onPageChange={onPageChange}
        />
      </CardContent>
    </Card>
  );
}
