"use client";

import type { ImportReport } from "@/lib/api/logbook-import";
import {
  collectionLabel,
  fileRestoreHint,
  importTotals,
  noteGroupPlacesSentence,
  reviewCollectionRows,
  truncatedNotesSentence,
} from "@/lib/logbook-import";
import { cn } from "@/lib/utils";
import { ImportNoteText, noteRowClass } from "@/components/import/import-note";
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

// Denser than the table's own rows, as the dive rows above it are.
const HEAD = "h-auto py-1";
const CELL = "py-1.5";

// Everything a report says besides its dive rows, rendered identically for the
// plan and for the result: a preview the diver approved and the result they got
// back are only worth comparing if they look the same, which is the same reason
// the API models them as one shape.
//
// Each section is a persistent element rather than a toast. An import can return
// hundreds of notes, and the diver has to still be able to read them while
// deciding whether to apply.
export function ImportReportView({
  report,
  archive,
}: {
  report: ImportReport;
  archive: boolean;
}) {
  const rows = reviewCollectionRows(report);
  const totals = importTotals(rows);
  const truncated = truncatedNotesSentence(report.notes_truncated);
  const groups = report.notes;
  const hint = fileRestoreHint(report, archive);

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
                {/* Its own column, never folded into "New" or "Skipped": the API
                    keeps the four counts disjoint precisely so a diver restoring
                    a backup can see how much of it actually came back. */}
                <TableHead className={cn(HEAD, "text-right")}>
                  Restored
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
                  <TableCell className={cn(CELL, "text-right tabular-nums")}>
                    {row.restored}
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
                <TableCell className={cn(CELL, "text-right tabular-nums")}>
                  {totals.restored}
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
          diver picked, which are their own rows above. */}
      {report.files.referenced > 0 && (
        <div>
          <h3 className="text-sm font-medium">Stored Files</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {`${report.files.referenced} named — ${report.files.restored} restored, ${report.files.not_contained} not carried, ${report.files.skipped} skipped.`}
          </p>
          {hint && <p className="text-sm text-muted-foreground mt-1">{hint}</p>}
        </div>
      )}

      {/* What is about no dive's row, and each row's overflow: one line per
          habit, with how often it came up. */}
      {(groups.length > 0 || truncated) && (
        <div>
          <h3 className="text-sm font-medium">
            {groups.length > 0 ? `Notes (${groups.length})` : "Notes"}
          </h3>
          <ul className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
            {groups.map((group, index) => {
              const places = noteGroupPlacesSentence(group);
              return (
                // Indexed: a group is identified by its code, collection and
                // sentence together, and the list is rebuilt wholesale from
                // each response.
                <li
                  key={`${group.code}-${index}`}
                  className={cn("text-sm", noteRowClass(group))}
                >
                  <ImportNoteText note={group} />
                  {places && (
                    <span className="block text-xs text-muted-foreground mt-0.5 break-all">
                      {places}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {truncated && (
            <p className="text-sm text-muted-foreground mt-2 italic">
              {truncated}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
