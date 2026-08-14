import { GearSet, gearItemLabel } from "@/lib/api/gear";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit, Loader2, Plus, Trash2 } from "lucide-react";

interface GearSetsCardProps {
  sets: GearSet[];
  isLoading: boolean;
  totalCount: number;
  currentPage: number;
  itemsPerPage: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
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
  totalCount,
  currentPage,
  itemsPerPage,
  hasMore,
  onPageChange,
  onCreate,
  onEdit,
  deletingId,
  onDelete,
}: GearSetsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span>Gear Sets</span>
          <div className="flex items-center gap-3">
            <Badge variant="secondary">
              {totalCount} set{totalCount !== 1 ? "s" : ""}
            </Badge>
            <Button variant="outline" size="sm" onClick={onCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New Set
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && sets.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : sets.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              No gear sets yet. Group the kit you use together — sidemount,
              tech, warm water — and load it into a dive in one click.
            </div>
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Set
            </Button>
          </div>
        ) : (
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
              {sets.map((set) => (
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
                        onClick={() => onEdit(set)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Delete"
                        onClick={() => onDelete(set.uuid)}
                        disabled={deletingId === set.uuid}
                      >
                        {deletingId === set.uuid ? (
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
        )}

        <PaginationFooter
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          totalCount={totalCount}
          hasMore={hasMore}
          isLoading={isLoading}
          itemLabel="gear sets"
          onPageChange={onPageChange}
        />
      </CardContent>
    </Card>
  );
}
