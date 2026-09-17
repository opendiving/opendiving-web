"use client";

import { GearSet, gearItemLabel } from "@/lib/api/gear";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { CountBadge } from "@/components/ui/count-badge";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit, Layers, Loader2, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useUnits } from "@/hooks/useUnits";
import { formatWeight } from "@/lib/units";

export interface GearSetsCardProps {
  sets: GearSet[];
  isLoading: boolean;
  /** True while a further page is in flight, as opposed to the first. */
  isLoadingMore: boolean;
  /** True when the last attempt failed, stopping the load-on-scroll. */
  hasFailed: boolean;
  totalCount: number;
  itemsPerPage: number;
  hasMore: boolean;
  onLoadMore: () => void;
  onCreate: () => void;
  onEdit: (set: GearSet) => void;
  deletingId: string | null;
  onDelete: (uuid: string) => void;
}

/**
 * The gear sets list: named bundles of kit a diver can load into a dive in one click.
 *
 * A set with no items is shown as "Empty" rather than hidden — an empty set is a real
 * thing a diver made and is about to fill, not a broken row.
 */
export function GearSetsCard({
  sets,
  isLoading,
  isLoadingMore,
  hasFailed,
  totalCount,
  itemsPerPage,
  hasMore,
  onLoadMore,
  onCreate,
  onEdit,
  deletingId,
  onDelete,
}: GearSetsCardProps) {
  const units = useUnits();

  return (
    <Card>
      <CardHeader>
        <CardTitle
          as="h2"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <span>Gear Sets</span>
          <div className="flex items-center gap-3">
            <CountBadge count={totalCount} isLoading={isLoading} label="set" />
            <Button variant="outline" size="sm" onClick={onCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New set
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!isLoading && sets.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No gear sets yet"
            description="Group the kit you use together — sidemount, tech, warm water — and load it into a dive in one click."
            action={
              <Button onClick={onCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add your first set
              </Button>
            }
          />
        ) : (
          <Table
            // Busy on the outside, hidden on each placeholder row within - the
            // split `ListRowsSkeleton` documents, applied here because the rows
            // themselves are `aria-hidden` and would otherwise leave a reader with
            // a table that is silently empty rather than one that is loading.
            aria-busy={sets.length === 0 || undefined}
          >
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Gear</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sets.length === 0 && (
                <TableRowsSkeleton columns={4} rows={itemsPerPage} />
              )}
              {sets.map((set) => (
                <TableRow key={set.uuid}>
                  <TableCell className="font-medium">{set.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {set.gear_items.length === 0
                      ? "Empty"
                      : set.gear_items.map(gearItemLabel).join(", ")}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {set.weight != null ? formatWeight(set.weight, units) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Named per row, not per action: ten identical "Edit"s tell
                        a screen reader's controls list nothing about which set.
                        See DECISIONS.md, "Ten rows of 'Edit' name nothing". */}
                    <div className="flex justify-end gap-2">
                      <IconTooltip label={`Edit ${set.name}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(set)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </IconTooltip>
                      <IconTooltip label={`Delete ${set.name}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(set.uuid)}
                          disabled={deletingId === set.uuid}
                        >
                          {deletingId === set.uuid ? (
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
          loadedCount={sets.length}
          totalCount={totalCount}
          itemsPerPage={itemsPerPage}
          itemLabel="gear sets"
          onLoadMore={onLoadMore}
        />
      </CardContent>
    </Card>
  );
}
