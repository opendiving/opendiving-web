"use client";

import { usePathname } from "next/navigation";

import { RouteFallback } from "@/components/ui/route-fallback";
import { DetailPageSkeleton } from "@/components/ui/page-skeleton";
import { SitesPageFrame } from "@/components/sites/sites-page-frame";
import { DEFAULT_ITEMS_PER_PAGE } from "@/hooks/useInfiniteResource";

// The boundary is keyed on the child segment, so one file covers the list and
// every site under it - and the frame it draws is the destination's, read off
// the URL the navigation is going to rather than the one it left.
export default function SitesLoading() {
  const pathname = usePathname();

  if (pathname?.startsWith("/sites/")) {
    return (
      <RouteFallback>
        <DetailPageSkeleton backHref="/sites" backLabel="Back to Dive Sites" />
      </RouteFallback>
    );
  }

  return (
    <RouteFallback>
      <SitesPageFrame
        isLoading
        totalCount={0}
        itemsPerPage={DEFAULT_ITEMS_PER_PAGE}
      />
    </RouteFallback>
  );
}
