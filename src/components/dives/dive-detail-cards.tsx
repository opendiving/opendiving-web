"use client";

import { useState } from "react";
import { useDiveDetail } from "@/components/dives/dive-detail-context";
import { DiveDetailMain } from "@/components/dives/dive-detail-main";
import { DiveDetailSidebar } from "@/components/dives/dive-detail-sidebar";
import {
  type DiveCardSection,
  DiveSectionDialog,
} from "@/components/dives/dive-section-dialog";
import { cn } from "@/lib/utils";

// In the form's order, which is the order a keyboard meets the cards in.
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
  // Held here, under `[id]`, so a step of the pager closes whatever was open:
  // a dialog seeded from the dive being left must not save over the next.
  const [editing, setEditing] = useState<DiveCardSection | null>(null);

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
      <DiveDetailMain dive={dive} onEdit={setEditing} />
      <DiveDetailSidebar
        dive={dive}
        trip={trip}
        course={course}
        contact={contact}
        people={people}
        onRecordingsChanged={refreshDive}
        onEdit={setEditing}
      />
      {CARD_SECTIONS.map((section) => (
        <DiveSectionDialog
          key={section}
          open={editing === section}
          onOpenChange={(open) => setEditing(open ? section : null)}
          dive={dive}
          section={section}
          onSaved={refreshDive}
        />
      ))}
    </div>
  );
}
