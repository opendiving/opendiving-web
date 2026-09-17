"use client";

import { usePathname } from "next/navigation";

import { RouteFallback } from "@/components/ui/route-fallback";
import { DetailPageSkeleton } from "@/components/ui/page-skeleton";
import { GearPageFrame } from "@/components/gear/gear-page-frame";

// The boundary is keyed on the child segment, so one file covers the two lists
// and every item under them - and the frame it draws is the destination's, read
// off the URL the navigation is going to rather than the one it left.
export default function GearLoading() {
  const pathname = usePathname();

  if (pathname?.startsWith("/gear/")) {
    return (
      <RouteFallback>
        <DetailPageSkeleton backHref="/gear" backLabel="Back to Gear" />
      </RouteFallback>
    );
  }

  return (
    <RouteFallback>
      <GearPageFrame />
    </RouteFallback>
  );
}
