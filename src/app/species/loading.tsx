"use client";

import { usePathname } from "next/navigation";

import { RouteFallback } from "@/components/ui/route-fallback";
import { DetailPageSkeleton } from "@/components/ui/page-skeleton";
import {
  SPECIES_PER_PAGE,
  SpeciesPageFrame,
} from "@/components/species/species-page-frame";

// The boundary is keyed on the child segment, so one file covers the life list
// and every species under it - and the frame it draws is the destination's, read
// off the URL the navigation is going to rather than the one it left.
export default function SpeciesLoading() {
  const pathname = usePathname();

  if (pathname?.startsWith("/species/")) {
    return (
      <RouteFallback>
        <DetailPageSkeleton backHref="/species" backLabel="Back to Species" />
      </RouteFallback>
    );
  }

  return (
    <RouteFallback>
      <SpeciesPageFrame
        isLoading
        totalCount={0}
        itemsPerPage={SPECIES_PER_PAGE}
      />
    </RouteFallback>
  );
}
