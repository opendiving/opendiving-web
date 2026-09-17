"use client";

import { InviteQueueFrame } from "@/components/admin/invite-queue-frame";
import { RouteFallback } from "@/components/ui/route-fallback";

// The queue is the section's only screen, and `/admin` is a server redirect onto
// it, so both paths under this boundary end up drawing the same frame. A second
// admin screen would want a destination switch here.
export default function AdminLoading() {
  return (
    <RouteFallback>
      <InviteQueueFrame isLoading totalCount={0} />
    </RouteFallback>
  );
}
