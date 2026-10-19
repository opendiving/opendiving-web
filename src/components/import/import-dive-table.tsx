"use client";

import Link from "next/link";

import { useUnits } from "@/hooks/useUnits";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import type {
  ImportDiveReport,
  ImportMemberReport,
} from "@/lib/api/logbook-import";
import {
  formatDiveDateTime,
  formatDurationForForm,
  formatUtcOffset,
  isDateOnlyStartTime,
  parseUtcOffsetMinutes,
} from "@/lib/date-time";
import {
  recordingDeviceLabel,
  UNNAMED_DEVICE_LABEL,
} from "@/lib/dive-recordings";
import { importDiveOutcomeSentence } from "@/lib/logbook-import";
import { formatDepth } from "@/lib/units";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// A dive's start as the file gives it: its wall clock, then the offset that clock
// was on where it records one. A naive start stops after the clock, and a bare
// date after the date - no midnight, and no zone nothing recorded.
function startText(startTime: string | null): string {
  if (!startTime) return "—";
  const when = formatDiveDateTime(startTime);
  if (isDateOnlyStartTime(startTime)) return when;
  const offset = parseUtcOffsetMinutes(startTime);
  return offset === null ? when : `${when} ${formatUtcOffset(offset)}`;
}

// Denser than the table's own rows: an import can list hundreds of dives.
const HEAD = "h-auto py-1";
const CELL = "py-1.5";

interface ImportDiveTableProps {
  dives: readonly ImportDiveReport[];
  members: readonly ImportMemberReport[];
  /**
   * Whether the rows are what was written. A result links every dive it names;
   * a plan links only the dives the diver already has, and opens them in a new
   * tab so the review stays where it is.
   */
  written: boolean;
}

// One row per dive the import creates or touches - the report on dives, which
// the counts table below it leaves to these rows.
export function ImportDiveTable({
  dives,
  members,
  written,
}: ImportDiveTableProps) {
  const units = useUnits();
  const withReturnTo = useWithReturnTo();

  return (
    <Table>
      <TableCaption className="sr-only">
        {written
          ? "The dives this import reached, and what happened to each"
          : "The dives these files become, and what the import would do with each"}
      </TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(HEAD, "pl-0")}>Start</TableHead>
          <TableHead className={cn(HEAD, "hidden md:table-cell text-right")}>
            Dive time
          </TableHead>
          <TableHead className={cn(HEAD, "text-right")}>Depth</TableHead>
          <TableHead className={cn(HEAD, "hidden md:table-cell")}>
            Recorded by
          </TableHead>
          <TableHead className={cn(HEAD, "hidden md:table-cell")}>
            Files
          </TableHead>
          <TableHead className={cn(HEAD, "pr-0")}>Outcome</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dives.map((dive, index) => {
          const start = startText(dive.start_time);
          const linkable =
            dive.uuid !== null &&
            (written ||
              dive.outcome === "linked" ||
              dive.outcome === "updated");
          const files = dive.members
            .map((member) => members[member]?.name)
            .filter((name): name is string => Boolean(name));
          const diveTime =
            dive.submerged_time != null
              ? formatDurationForForm(dive.submerged_time)
              : null;
          const device = dive.device
            ? (recordingDeviceLabel(dive.device) ?? UNNAMED_DEVICE_LABEL)
            : null;
          return (
            // Indexed: a skipped dive has no uuid, and two rows can name one
            // uuid where a document claims it twice. The list is rebuilt
            // wholesale from each response.
            <TableRow key={`${dive.uuid ?? "skipped"}-${index}`}>
              <TableHead
                scope="row"
                className={cn(CELL, "h-auto pl-0 font-normal text-foreground")}
              >
                {linkable ? (
                  <Link
                    // A new tab has no importer to go back to: the preview
                    // lives in this one.
                    href={
                      written
                        ? withReturnTo(`/dives/${dive.uuid}`)
                        : `/dives/${dive.uuid}`
                    }
                    className="underline underline-offset-2"
                    {...(written
                      ? {}
                      : { target: "_blank", rel: "noopener noreferrer" })}
                  >
                    {start}
                  </Link>
                ) : (
                  start
                )}
                {/* The columns a phone has no room for, folded under the start. */}
                <span className="md:hidden block text-xs text-muted-foreground">
                  {[diveTime, device].filter(Boolean).join(" · ")}
                </span>
              </TableHead>
              <TableCell
                className={cn(
                  CELL,
                  "hidden md:table-cell text-right tabular-nums whitespace-nowrap",
                )}
              >
                {diveTime ?? "—"}
              </TableCell>
              <TableCell
                className={cn(
                  CELL,
                  "text-right tabular-nums whitespace-nowrap",
                )}
              >
                {dive.max_depth != null
                  ? formatDepth(dive.max_depth, units, { decimals: 1 })
                  : "—"}
              </TableCell>
              <TableCell className={cn(CELL, "hidden md:table-cell")}>
                {device ?? "—"}
              </TableCell>
              <TableCell className={cn(CELL, "hidden md:table-cell break-all")}>
                {files.length > 0
                  ? files.map((name, fileIndex) => (
                      // Indexed: a batch can carry two files of one name.
                      <span key={`${name}-${fileIndex}`} className="block">
                        {name}
                      </span>
                    ))
                  : "—"}
              </TableCell>
              <TableCell className={cn(CELL, "pr-0")}>
                {importDiveOutcomeSentence(dive)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
