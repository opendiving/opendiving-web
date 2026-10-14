"use client";

import { useState } from "react";
import { useDiveDetail } from "@/components/dives/dive-detail-context";
import { DiveDetailMain } from "@/components/dives/dive-detail-main";
import { DiveDetailSidebar } from "@/components/dives/dive-detail-sidebar";
import {
  type DiveCardSection,
  DiveSectionDialog,
} from "@/components/dives/dive-section-dialog";
import { DiveImportDialog } from "@/components/dives/dive-import-dialog";
import { cn } from "@/lib/utils";

const CARD_SECTIONS: readonly DiveCardSection[] = [
  "Training",
  "Location",
  "Environment",
  "Tanks",
  "Gear",
  "Marine life",
  "People",
  "Notes",
];

/**
 * The dive's cards, and all `dives/(detail)/[id]/page.tsx` draws. The header,
 * the dive itself and the delete flow belong to `dives/(detail)/layout.tsx`,
 * which is the part that survives a step of the prev/next pager - see the
 * comment there.
 */
export function DiveDetailCards() {
  const { dive, isLoading, trip, course, contact, people, refreshDive } =
    useDiveDetail();
  // With the dive it was opened on, and open only while that dive is the one on
  // the page. The dimmed cards of a step still take a click, and a dialog seeded
  // from the dive being left must close when the next lands rather than save its
  // values over it.
  const [editing, setEditing] = useState<{
    section: DiveCardSection | "Import";
    diveUuid: string;
  } | null>(null);
  const edit = (section: DiveCardSection | "Import") =>
    setEditing({ section, diveUuid: dive.uuid });

  // Dimmed, not replaced, while the next dive loads: these cards still describe
  // the dive being stepped away from, and fading them says "this is on its way
  // out" without the page losing its height and scroll position. This component
  // is re-mounted by the step - its page lives under `[id]` - but it re-mounts against
  // the layout's dive, which is still the outgoing one until the next lands.
  return (
    <div
      className={cn(
        "grid grid-cols-1 lg:grid-cols-3 gap-6 max-sm:gap-2.5 transition-opacity",
        isLoading && "opacity-50",
      )}
    >
      <DiveDetailMain dive={dive} onEdit={edit} />
      <DiveDetailSidebar
        dive={dive}
        trip={trip}
        course={course}
        contact={contact}
        people={people}
        onRecordingsChanged={refreshDive}
        onEdit={edit}
        onEditRecordings={() => edit("Import")}
      />
      <DiveImportDialog
        open={editing?.section === "Import" && editing.diveUuid === dive.uuid}
        onOpenChange={(open) => (open ? edit("Import") : setEditing(null))}
        dive={dive}
        onSaved={refreshDive}
      />
      {CARD_SECTIONS.map((section) => (
        <DiveSectionDialog
          key={section}
          open={editing?.section === section && editing.diveUuid === dive.uuid}
          onOpenChange={(open) => (open ? edit(section) : setEditing(null))}
          dive={dive}
          section={section}
          onSaved={refreshDive}
        />
      ))}
    </div>
  );
}
