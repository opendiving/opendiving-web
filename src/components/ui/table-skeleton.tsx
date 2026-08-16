import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Cycled by (row + column) so the placeholder doesn't read as a perfect grid.
// Deterministic rather than random: a random width would differ between the
// server render and the client's and trip hydration.
const WIDTHS = ["w-full", "w-4/5", "w-3/5", "w-2/3"];

/**
 * Placeholder rows for a table that is still loading. Goes *inside* the real
 * `<TableBody>`, so the header row and its column labels stay on screen while
 * the data arrives and the table doesn't collapse to a centered spinner.
 *
 * `columns` must match the number of `<TableHead>`s above it, or the browser
 * will lay the placeholder out on a different grid than the real rows.
 */
export function TableRowsSkeleton({
  columns,
  rows = 5,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <TableRow key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <TableCell key={column}>
              <Skeleton
                className={cn("h-4", WIDTHS[(row + column) % WIDTHS.length])}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
