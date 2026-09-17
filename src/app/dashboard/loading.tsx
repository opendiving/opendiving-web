"use client";

import { DashboardPageFrame } from "@/components/dashboard/dashboard-page-frame";
import { RouteFallback } from "@/components/ui/route-fallback";

// The dashboard's frame, painted at the click. `pending` is what keeps the cards
// that fetch for themselves from asking twice - the page mounting behind this
// one is the one that asks.
export default function DashboardLoading() {
  return (
    <RouteFallback>
      <DashboardPageFrame pending />
    </RouteFallback>
  );
}
