"use client";

import type { ImportReport } from "@/lib/api/logbook-import";
import {
  collectionLabel,
  conversionKindLabel,
  conversionKindTone,
  conversionWhereSentence,
  fileRestoreHint,
  importTotals,
  noteIsWarning,
  reviewCollectionRows,
  truncatedConversionSentence,
  truncatedNotesSentence,
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

// Denser than the table's own rows, as the dive rows above it are.
const HEAD = "h-auto py-1";
const CELL = "py-1.5";

// The row colour per finding kind, and the badge beside it. Only `dropped` is a
// loss and only `dropped` is amber; the rest explain rather than warn, and an
// unfamiliar kind lands on `neutral` - see `conversionKindTone`.
const CONVERSION_TONE_CLASSES = {
  warning: {
    row: "text-warning",
    badge: "border-warning/40 text-warning",
  },
  neutral: { row: "text-foreground", badge: "border-border text-foreground" },
  muted: {
    row: "text-muted-foreground",
    badge: "border-border/60 text-muted-foreground",
  },
} as const;

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
  // A note a dive row names is shown under that row; the list keeps the rest.
  const onRows = new Set(report.dives.flatMap((dive) => dive.notes));
  const listed = report.notes.flatMap((note, index) =>
    onRows.has(index) ? [] : [{ note, index }],
  );
  const hint = fileRestoreHint(report, archive);
  const conversion = report.conversion;
  const conversionTruncated = truncatedConversionSentence(
    conversion?.groups_truncated ?? 0,
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

      {(listed.length > 0 || truncated) && (
        <div>
          <h3 className="text-sm font-medium">
            {listed.length > 0 ? `Notes (${listed.length})` : "Notes"}
          </h3>
          <ul className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
            {listed.map(({ note, index }) => (
              // Indexed because a note has no identifier of its own: `uuid` is the
              // record's and repeats across notes about one record, and `code`
              // repeats far more. The index is the note's own in `notes`, which is
              // rebuilt wholesale from each response, so it is stable for as long
              // as it is rendered.
              <li
                key={`${note.code}-${note.uuid ?? index}-${index}`}
                className={
                  noteIsWarning(note.code)
                    ? "text-sm text-warning"
                    : "text-sm text-muted-foreground"
                }
              >
                {note.collection && (
                  <span className="font-medium">
                    {collectionLabel(note.collection)}:{" "}
                  </span>
                )}
                {note.message}
              </li>
            ))}
          </ul>
          {truncated && (
            <p className="text-sm text-muted-foreground mt-2 italic">
              {truncated}
            </p>
          )}
        </div>
      )}

      {/* Absent when nothing was converted: a heading saying nothing was lost
          would be a claim about a conversion that never happened. */}
      {conversion && (
        <div>
          <h3 className="text-sm font-medium">About the Original Files</h3>
          {conversion.groups.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">
              Everything in the converted files came across.
            </p>
          ) : (
            <ul className="mt-2 space-y-2 max-h-64 overflow-y-auto">
              {conversion.groups.map((group, index) => {
                const tone =
                  CONVERSION_TONE_CLASSES[conversionKindTone(group.kind)];
                return (
                  // Indexed for the same reason the notes list is: a group is
                  // identified by its `(kind, message)` pair and nothing else,
                  // and the list is rebuilt wholesale from each response.
                  <li
                    key={`${group.kind}-${index}`}
                    className={`text-sm ${tone.row}`}
                  >
                    <span
                      className={`inline-flex items-center rounded border px-1.5 py-0.5 mr-2 text-xs font-medium align-[1px] ${tone.badge}`}
                    >
                      {conversionKindLabel(group.kind)}
                    </span>
                    {group.message}
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {conversionWhereSentence(group)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {conversionTruncated && (
            <p className="text-sm text-muted-foreground mt-2 italic">
              {conversionTruncated}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
