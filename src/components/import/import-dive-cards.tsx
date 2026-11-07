"use client";

import { useState } from "react";

import { DiveCard } from "@/components/dives/dive-card";
import { diveTitleText } from "@/components/dives/dive-title";
import { ImportDivePanel } from "@/components/import/import-dive-panel";
import { Badge } from "@/components/ui/badge";
import { BackdropCardList } from "@/components/ui/backdrop-card";
import type { LogbookImportDive } from "@/lib/api/logbook-import";
import { formatDiveDateTime } from "@/lib/date-time";
import { importOutcomeLabel, importRowHasCard } from "@/lib/logbook-import";

// A filled chip rather than `secondary`, which all but disappears on a card, and
// out of the pointer's way: the whole card is the control under it.
function OutcomeChip({ row }: { row: LogbookImportDive }) {
  return (
    <Badge
      variant={row.outcome === "new" ? "teal" : "coral"}
      className="pointer-events-none"
    >
      {importOutcomeLabel(row.outcome)}
    </Badge>
  );
}

// The dive a card opens, in words a screen reader can tell from the next card's.
function openLabel(row: LogbookImportDive, applied: boolean): string {
  const dive = row.dive!;
  const name = `${diveTitleText(dive.dive_number, dive.dive_sites)}, ${formatDiveDateTime(dive.start_time)}`;
  if (row.outcome === "new") return `New dive: ${name}`;
  return `What ${applied ? "changed" : "changes"} on ${name}`;
}

// One card per dive the import adds or changes. In a review a card opens the
// panel, the dive not being written yet. In a result a new dive's card links to
// the dive, and a modified one's still opens the panel, whose before and after
// are nowhere else to be read, with that link inside it.
export function ImportDiveCards({
  dives,
  applied,
}: {
  dives: readonly LogbookImportDive[];
  applied: boolean;
}) {
  const [opened, setOpened] = useState<LogbookImportDive | null>(null);
  const rows = dives.filter(importRowHasCard);
  if (rows.length === 0) return null;

  return (
    <>
      {/* One dive to a row below `lg`, two above, as /dives. Not paged, the review
          being one document: `BackdropCard` mounts a card's map only near the
          viewport, so a long import asks for no tile it does not show. */}
      <BackdropCardList layout="grid gap-4 max-sm:gap-2.5 lg:grid-cols-2">
        {rows.map((row, index) => (
          <DiveCard
            // Indexed: two rows can name one uuid where a document claims it
            // twice, and the list is rebuilt wholesale from each response.
            key={`${row.uuid}-${index}`}
            dive={row.dive!}
            importRow={{
              chip: <OutcomeChip row={row} />,
              ...(applied && row.outcome === "new"
                ? { linkTo: row.uuid ?? undefined }
                : {
                    open: {
                      onOpen: () => setOpened(row),
                      label: openLabel(row, applied),
                    },
                  }),
            }}
          />
        ))}
      </BackdropCardList>
      <ImportDivePanel
        row={opened}
        applied={applied}
        onClose={() => setOpened(null)}
      />
    </>
  );
}
