import type { ImportDiveNote } from "@/lib/api/logbook-import";
import {
  collectionLabel,
  noteKindLabel,
  noteKindTone,
  type NoteKindTone,
} from "@/lib/logbook-import";
import { cn } from "@/lib/utils";

// The line colour per kind, and the badge beside it. Only `dropped` is a loss and
// only `dropped` is amber; the rest explain rather than warn, and an unfamiliar
// kind lands on `neutral` - see `noteKindTone`.
const NOTE_TONE_CLASSES: Record<NoteKindTone, { row: string; badge: string }> =
  {
    warning: {
      row: "text-warning",
      badge: "border-warning/40 text-warning",
    },
    neutral: {
      row: "text-foreground",
      badge: "border-border text-foreground",
    },
    muted: {
      row: "text-muted-foreground",
      badge: "border-border/60 text-muted-foreground",
    },
  };

/** The line colour a note's `<li>` takes. */
export function noteRowClass(note: ImportDiveNote): string {
  return NOTE_TONE_CLASSES[noteKindTone(note.kind)].row;
}

interface ImportNoteTextProps {
  note: ImportDiveNote;
  /**
   * The collection the surrounding list is already about, whose name the note
   * leaves out - a dive's row says which dive, so only another collection's
   * note, such as a sighting's, says whose.
   */
  implied?: string;
}

// One note's badge, collection and sentence: the same however the import came by
// it, on a dive's row and in the report's groups alike.
export function ImportNoteText({ note, implied }: ImportNoteTextProps) {
  const label = noteKindLabel(note.kind);
  return (
    <>
      {label && (
        <span
          className={cn(
            "inline-flex items-center rounded border px-1 mr-1.5 text-xs font-medium align-[1px]",
            NOTE_TONE_CLASSES[noteKindTone(note.kind)].badge,
          )}
        >
          {label}
        </span>
      )}
      {note.collection && note.collection !== implied && (
        <span className="font-medium">
          {collectionLabel(note.collection)}:{" "}
        </span>
      )}
      {note.message}
    </>
  );
}
