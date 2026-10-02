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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          {written
            ? "The dives this import reached, and what happened to each"
            : "The dives these files become, and what the import would do with each"}
        </caption>
        <thead>
          <tr className="text-muted-foreground text-left">
            <th scope="col" className="font-medium py-1 pr-3">
              Start
            </th>
            <th
              scope="col"
              className="hidden md:table-cell font-medium py-1 px-3 text-right"
            >
              Duration
            </th>
            <th scope="col" className="font-medium py-1 px-3 text-right">
              Depth
            </th>
            <th
              scope="col"
              className="hidden md:table-cell font-medium py-1 px-3"
            >
              Recorded by
            </th>
            <th
              scope="col"
              className="hidden md:table-cell font-medium py-1 px-3"
            >
              Files
            </th>
            <th scope="col" className="font-medium py-1 pl-3">
              Outcome
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
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
            const duration =
              dive.duration != null
                ? formatDurationForForm(dive.duration)
                : null;
            const device = dive.device
              ? (recordingDeviceLabel(dive.device) ?? UNNAMED_DEVICE_LABEL)
              : null;
            return (
              // Indexed: a skipped dive has no uuid, and two rows can name one
              // uuid where a document claims it twice. The list is rebuilt
              // wholesale from each response.
              <tr key={`${dive.uuid ?? "skipped"}-${index}`}>
                <th scope="row" className="text-left font-normal py-1.5 pr-3">
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
                    {[duration, device].filter(Boolean).join(" · ")}
                  </span>
                </th>
                <td className="hidden md:table-cell py-1.5 px-3 text-right tabular-nums whitespace-nowrap">
                  {duration ?? "—"}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap">
                  {dive.max_depth != null
                    ? formatDepth(dive.max_depth, units, { decimals: 1 })
                    : "—"}
                </td>
                <td className="hidden md:table-cell py-1.5 px-3">
                  {device ?? "—"}
                </td>
                <td className="hidden md:table-cell py-1.5 px-3 break-all">
                  {files.length > 0 ? files.join(", ") : "—"}
                </td>
                <td className="py-1.5 pl-3">
                  {importDiveOutcomeSentence(dive)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
