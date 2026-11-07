"use client";

import type { ImportNoteGroup } from "@/lib/api/logbook-import";
import {
  noteGroupPlacesSentence,
  truncatedNotesSentence,
} from "@/lib/logbook-import";
import { cn } from "@/lib/utils";
import { ImportNoteText, noteRowClass } from "@/components/import/import-note";

// What is about no dive's row, and each row's overflow: one line per habit, with
// how often it came up.
export function ImportNoteGroups({
  groups,
  notesTruncated,
}: {
  groups: readonly ImportNoteGroup[];
  notesTruncated: number;
}) {
  const truncated = truncatedNotesSentence(notesTruncated);
  if (groups.length === 0 && !truncated) return null;

  return (
    <div>
      <h2 className="text-sm font-medium">
        {groups.length > 0 ? `Notes (${groups.length})` : "Notes"}
      </h2>
      <ul className="mt-2 space-y-1.5">
        {groups.map((group, index) => {
          const places = noteGroupPlacesSentence(group);
          return (
            // Indexed: a group is identified by its code, collection and
            // sentence together, and the list is rebuilt wholesale from each
            // response.
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
        <p className="text-sm text-muted-foreground mt-2 italic">{truncated}</p>
      )}
    </div>
  );
}
