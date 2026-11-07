"use client";

import type { LogbookImportRead } from "@/lib/api/logbook-import";
import {
  collectionLabel,
  fileRestoreHint,
  importTotals,
  reviewCollectionRows,
} from "@/lib/logbook-import";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Denser than the table's own rows: an import can name hundreds of records.
const HEAD = "h-auto py-1";
const CELL = "py-1.5";

// What an import does besides its dives, drawn alike for the review and the
// result: a review the diver approved and the result they got back are only worth
// comparing if they look the same, which is the same reason the API models them as
// one shape. An applied import's hint is left out: importing the archive is advice
// about a decision already taken.
export function ImportReportView({ record }: { record: LogbookImportRead }) {
  const rows = reviewCollectionRows(record);
  const totals = importTotals(rows);
  const { files } = record;
  const hint = fileRestoreHint(
    files,
    record.archive || record.status === "applied",
  );

  return (
    <div className="space-y-4">
      {rows.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">Records</h3>
          <Table className="mt-2">
            <TableCaption className="sr-only">
              Records by type, and what the import does with each
            </TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(HEAD, "pl-0")}>Type</TableHead>
                <TableHead className={cn(HEAD, "text-right")}>New</TableHead>
                <TableHead className={cn(HEAD, "text-right")}>
                  Already here
                </TableHead>
                <TableHead className={cn(HEAD, "pr-0 text-right")}>
                  Skipped
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.collection}>
                  <TableHead
                    scope="row"
                    className={cn(
                      CELL,
                      "h-auto pl-0 font-normal text-foreground",
                    )}
                  >
                    {collectionLabel(row.collection)}
                  </TableHead>
                  <TableCell className={cn(CELL, "text-right tabular-nums")}>
                    {row.created}
                  </TableCell>
                  <TableCell className={cn(CELL, "text-right tabular-nums")}>
                    {row.linked}
                  </TableCell>
                  <TableCell
                    className={cn(CELL, "pr-0 text-right tabular-nums")}
                  >
                    {row.skipped}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="border-t-2 bg-transparent">
              <TableRow className="hover:bg-transparent">
                <TableHead
                  scope="row"
                  className={cn(CELL, "h-auto pl-0 text-foreground")}
                >
                  Total
                </TableHead>
                <TableCell className={cn(CELL, "text-right tabular-nums")}>
                  {totals.created}
                </TableCell>
                <TableCell className={cn(CELL, "text-right tabular-nums")}>
                  {totals.linked}
                </TableCell>
                <TableCell className={cn(CELL, "pr-0 text-right tabular-nums")}>
                  {totals.skipped}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* The stored files a document or an archive names - never the files the
          diver picked. */}
      {files.referenced > 0 && (
        <div>
          <h3 className="text-sm font-medium">Stored Files</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {`${files.referenced} named — ${files.restored} restored, ${files.not_contained} not carried, ${files.skipped} skipped.`}
          </p>
          {hint && <p className="text-sm text-muted-foreground mt-1">{hint}</p>}
        </div>
      )}
    </div>
  );
}
