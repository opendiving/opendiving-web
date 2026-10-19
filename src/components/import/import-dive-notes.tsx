"use client";

import type { ConversionNote, ImportNote } from "@/lib/api/logbook-import";
import {
  collectionLabel,
  conversionKindLabel,
  conversionKindTone,
  noteIsWarning,
  truncatedDiveFindingsSentence,
} from "@/lib/logbook-import";
import { cn } from "@/lib/utils";
import { CONVERSION_TONE_CLASSES } from "@/components/import/import-report-view";

interface ImportDiveNotesProps {
  /** The report's notes this dive's row names, each with its index there. */
  notes: readonly { index: number; note: ImportNote }[];
  conversionNotes: readonly ConversionNote[];
  conversionNotesTruncated: number;
}

// What the import and the conversion said about one dive, under that dive's
// row: both are written as "this dive", and only read right beside it.
export function ImportDiveNotes({
  notes,
  conversionNotes,
  conversionNotesTruncated,
}: ImportDiveNotesProps) {
  const truncated = truncatedDiveFindingsSentence(conversionNotesTruncated);

  return (
    <ul className="space-y-0.5 text-xs">
      {notes.map(({ index, note }) => (
        <li
          key={`note-${index}`}
          className={
            noteIsWarning(note.code) ? "text-warning" : "text-muted-foreground"
          }
        >
          {/* The row says which dive; another collection's note, such as a
              sighting's, still says whose. */}
          {note.collection && note.collection !== "dives" && (
            <span className="font-medium">
              {collectionLabel(note.collection)}:{" "}
            </span>
          )}
          {note.message}
        </li>
      ))}
      {conversionNotes.map((finding, index) => {
        const tone = CONVERSION_TONE_CLASSES[conversionKindTone(finding.kind)];
        return (
          // Indexed: a finding has no identifier, and the row's list is
          // rebuilt wholesale from each response.
          <li key={`finding-${index}`} className={tone.row}>
            <span
              className={cn(
                "inline-flex items-center rounded border px-1 mr-1.5 font-medium align-[1px]",
                tone.badge,
              )}
            >
              {conversionKindLabel(finding.kind)}
            </span>
            {finding.message}
            {/* The converter's own path, not a time: its segments are seconds in
                one format and indexes in another. */}
            {finding.where && (
              <span className="ml-1.5 text-muted-foreground break-all">
                {finding.where}
              </span>
            )}
          </li>
        );
      })}
      {truncated && (
        <li className="italic text-muted-foreground">{truncated}</li>
      )}
    </ul>
  );
}
