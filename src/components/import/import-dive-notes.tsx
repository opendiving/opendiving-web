"use client";

import type { ImportDiveNote } from "@/lib/api/logbook-import";
import { truncatedDiveNotesSentence } from "@/lib/logbook-import";
import { ImportNoteText, noteRowClass } from "@/components/import/import-note";

interface ImportDiveNotesProps {
  notes: readonly ImportDiveNote[];
  notesTruncated: number;
}

// Everything the import has to say about one dive, under that dive's row: each
// note is written as "this dive", and only reads right beside it.
export function ImportDiveNotes({
  notes,
  notesTruncated,
}: ImportDiveNotesProps) {
  const truncated = truncatedDiveNotesSentence(notesTruncated);

  return (
    <ul className="space-y-0.5 text-xs">
      {notes.map((note, index) => (
        // Indexed: a note has no identifier, and the row's list is rebuilt
        // wholesale from each response.
        <li key={`${note.code}-${index}`} className={noteRowClass(note)}>
          <ImportNoteText note={note} implied="dives" />
        </li>
      ))}
      {truncated && (
        <li className="italic text-muted-foreground">{truncated}</li>
      )}
    </ul>
  );
}
