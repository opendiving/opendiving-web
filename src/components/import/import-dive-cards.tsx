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
function openLabel(row: LogbookImportDive): string {
  const dive = row.dive!;
  const name = `${diveTitleText(dive.dive_number, dive.dive_sites)}, ${formatDiveDateTime(dive.start_time)}`;
  return row.outcome === "new"
    ? `New dive: ${name}`
    : `What changes on ${name}`;
}

// One card per dive the import adds or changes. In a review a card opens the
// panel, the dive not being written yet; in a result it links to the dive.
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
      {/* One dive to a row below `lg`, two above, as /dives. */}
      <BackdropCardList layout="grid gap-4 max-sm:gap-2.5 lg:grid-cols-2">
        {rows.map((row, index) => (
          <DiveCard
            // Indexed: two rows can name one uuid where a document claims it
            // twice, and the list is rebuilt wholesale from each response.
            key={`${row.uuid}-${index}`}
            dive={row.dive!}
            importRow={{
              chip: <OutcomeChip row={row} />,
              ...(applied
                ? { linkTo: row.uuid ?? undefined }
                : {
                    open: {
                      onOpen: () => setOpened(row),
                      label: openLabel(row),
                    },
                  }),
            }}
          />
        ))}
      </BackdropCardList>
      <ImportDivePanel row={opened} onClose={() => setOpened(null)} />
    </>
  );
}
