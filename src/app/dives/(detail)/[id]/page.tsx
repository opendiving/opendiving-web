"use client";

import { useDiveDetail } from "@/components/dives/dive-detail-context";
import { DiveDetailMain } from "@/components/dives/dive-detail-main";
import { DiveDetailSidebar } from "@/components/dives/dive-detail-sidebar";
import { cn } from "@/lib/utils";

/**
 * The dive's cards. The header, the dive itself and the delete flow belong to
 * the layout in the route group above this segment, which is the part that
 * survives a step of the prev/next pager - see the comment there.
 */
export default function DiveDetailPage() {
  const { dive, isLoading, trip, course, refreshDive } = useDiveDetail();

  // Dimmed, not replaced, while the next dive loads: these cards still describe
  // the dive being stepped away from, and fading them says "this is on its way
  // out" without the page losing its height and scroll position. This component
  // is re-mounted by the step - it lives under `[id]` - but it re-mounts against
  // the layout's dive, which is still the outgoing one until the next lands.
  return (
    <div
      className={cn(
        "grid grid-cols-1 lg:grid-cols-3 gap-6 transition-opacity",
        isLoading && "opacity-50",
      )}
    >
      <DiveDetailMain dive={dive} />
      <DiveDetailSidebar
        dive={dive}
        trip={trip}
        course={course}
        onSourceFileChanged={refreshDive}
      />
    </div>
  );
}
