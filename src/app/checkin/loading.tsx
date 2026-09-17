"use client";

import { CheckInPageFrame } from "@/components/checkin/checkin-page-frame";
import { RouteFallback } from "@/components/ui/route-fallback";

// `/checkin` is the whole segment, so this fallback needs no destination switch. The
// frame's defaults are the page's own first render - the profile straight from the
// signed-in user, and placeholders where the three requests will land.
export default function CheckInLoading() {
  return (
    <RouteFallback>
      <CheckInPageFrame />
    </RouteFallback>
  );
}
