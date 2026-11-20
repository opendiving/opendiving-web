"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { diveInfoSections } from "@/components/dives/dive-info-dialog";
import { diveTitleText } from "@/components/dives/dive-title";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RecordInfoSections,
  type RecordInfoSection,
} from "@/components/ui/record-info-dialog";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import { useUnits } from "@/hooks/useUnits";
import type { Dive } from "@/lib/api/dives";
import {
  importSourceLabel,
  type LogbookImportChange,
  type LogbookImportDive,
} from "@/lib/api/logbook-import";
import {
  diveRecordings,
  noFileKeptSentence,
  recordingDeviceLabel,
  recordingLabel,
  UNNAMED_DEVICE_LABEL,
} from "@/lib/dive-recordings";
import {
  describeImportChange,
  mixtureSummary,
  recordingProfileSummary,
} from "@/lib/import-changes";
import { formatPressure, type UnitSelection } from "@/lib/units";

// A new dive's cylinders and recordings, which a stored dive's page gives cards
// of their own: the dive does not have that page yet.
function reviewSections(dive: Dive, units: UnitSelection): RecordInfoSection[] {
  const sections = diveInfoSections(dive, units);
  if (dive.mixtures.length > 0) {
    sections.push({
      heading: "Tanks",
      facts: dive.mixtures.map((mixture, index) => {
        const pressure = (bar?: number | null) =>
          bar != null ? formatPressure(bar, units) : "—";
        const pressures =
          mixture.start_pressure != null || mixture.end_pressure != null
            ? `${pressure(mixture.start_pressure)} → ${pressure(mixture.end_pressure)}`
            : null;
        return {
          label: `Tank ${index + 1}`,
          value: [mixtureSummary(mixture), pressures]
            .filter((part) => part !== null)
            .join(" · "),
        };
      }),
    });
  }
  const recordings = diveRecordings(dive);
  if (recordings.length > 0) {
    sections.push({
      heading: "Recordings",
      facts: recordings.map((recording) => {
        const noFileKept = noFileKeptSentence(recording);
        return {
          label: recordingLabel(recording),
          wide: true,
          value: (
            <>
              <span className="block font-medium">
                {recordingDeviceLabel(recording.device) ?? UNNAMED_DEVICE_LABEL}
              </span>
              {noFileKept ? (
                <span className="block text-muted-foreground">
                  {noFileKept}
                </span>
              ) : (
                recording.files.map((file, index) => (
                  // Indexed: an identifier here may be one the apply replaces.
                  <span key={index} className="block break-all">
                    {`${file.original_filename} · ${importSourceLabel(file.parser_key)}`}
                  </span>
                ))
              )}
              {recording.profile && (
                <span className="block text-muted-foreground">
                  {recordingProfileSummary(recording.profile, units)}
                </span>
              )}
            </>
          ),
        };
      }),
    });
  }
  return sections;
}

function ChangeList({
  changes,
  units,
}: {
  changes: readonly LogbookImportChange[];
  units: UnitSelection;
}) {
  return (
    <ul className="divide-y divide-border text-sm">
      {changes.map((change) => {
        const row = describeImportChange(change, units);
        return (
          <li key={change.member} className="py-2 first:pt-0 last:pb-0">
            {row.kind === "element" ? (
              <span className="font-medium break-words">{row.text}</span>
            ) : (
              <>
                <div className="text-xs text-muted-foreground break-all">
                  {row.label}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 break-words">
                  <span className="sr-only">Was</span>
                  <span className="min-w-0 text-muted-foreground">
                    {row.before}
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="sr-only">Becomes</span>
                  <span className="min-w-0 font-medium">{row.after}</span>
                </div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// What one card of the review stands for: a new dive whole, as the dive page's
// Info shows one with its cylinders and recordings beside it, or only what the
// import changes on a dive the diver has. On an applied import it leads to the
// dive, by the row's `uuid`: the identifiers inside `dive` may name nothing.
export function ImportDivePanel({
  row,
  applied,
  onClose,
}: {
  row: LogbookImportDive | null;
  applied: boolean;
  onClose: () => void;
}) {
  const { preferences: units } = useUnits();
  const withReturnTo = useWithReturnTo();
  const dive = row?.dive;

  return (
    <Dialog
      open={!!dive}
      onOpenChange={(open) => !open && onClose()}
      dismissOnOutsidePress
    >
      {dive && row && (
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {diveTitleText(dive.dive_number, dive.dive_sites)}
            </DialogTitle>
          </DialogHeader>
          {row.outcome === "modified" ? (
            <ChangeList changes={row.changes} units={units} />
          ) : (
            <RecordInfoSections sections={reviewSections(dive, units)} />
          )}
          {applied && row.uuid && (
            <p className="text-sm">
              {/* Closed on the way out: this route stays mounted, and the way
                  back should not land on an open dialog. */}
              <Link
                href={withReturnTo(`/dives/${row.uuid}`)}
                onClick={onClose}
                className="underline underline-offset-2"
              >
                Open this dive
              </Link>
            </p>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
