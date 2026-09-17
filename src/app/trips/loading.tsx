"use client";

import { usePathname } from "next/navigation";

import { RouteFallback } from "@/components/ui/route-fallback";
import { DetailPageSkeleton } from "@/components/ui/page-skeleton";
import { TripsPageFrame } from "@/components/trips/trips-page-frame";
import { DEFAULT_ITEMS_PER_PAGE } from "@/hooks/useInfiniteResource";

// The boundary is keyed on the child segment, so one file covers the list and
// every trip under it - and the frame it draws is the destination's, read off
// the URL the navigation is going to rather than the one it left.
export default function TripsLoading() {
  const pathname = usePathname();

  if (pathname?.startsWith("/trips/")) {
    return (
      <RouteFallback>
        <DetailPageSkeleton backHref="/trips" backLabel="Back to Trips" />
      </RouteFallback>
    );
  }

  return (
    <RouteFallback>
      <TripsPageFrame
        isLoading
        totalCount={0}
        itemsPerPage={DEFAULT_ITEMS_PER_PAGE}
      />
    </RouteFallback>
  );
}
