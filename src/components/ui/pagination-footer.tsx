"use client";

import { Button } from "@/components/ui/button";

interface PaginationFooterProps {
  currentPage: number;
  itemsPerPage: number;
  totalCount: number;
  hasMore: boolean;
  isLoading: boolean;
  /** Plural label for the items being paginated, e.g. "dives", "trips". */
  itemLabel: string;
  onPageChange: (page: number) => void;
}

// Shared "Showing X to Y of Z" + Previous/Next footer for the list pages and
// for the cards that paginate a resource inside one. Renders nothing if
// everything fits on one page.
export function PaginationFooter({
  currentPage,
  itemsPerPage,
  totalCount,
  hasMore,
  isLoading,
  itemLabel,
  onPageChange,
}: PaginationFooterProps) {
  if (totalCount <= itemsPerPage) return null;

  return (
    <div className="flex items-center justify-between mt-6">
      <div className="text-sm text-muted-foreground">
        Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
        {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount}{" "}
        {itemLabel}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || isLoading}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasMore || isLoading}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
