"use client";

import { usePathname } from "next/navigation";

import { RouteFallback } from "@/components/ui/route-fallback";
import { DetailPageSkeleton } from "@/components/ui/page-skeleton";
import { CoursesPageFrame } from "@/components/courses/courses-page-frame";
import { DEFAULT_ITEMS_PER_PAGE } from "@/hooks/useInfiniteResource";

// The boundary is keyed on the child segment, so one file covers the list and
// every course under it - and the frame it draws is the destination's, read off
// the URL the navigation is going to rather than the one it left.
export default function CoursesLoading() {
  const pathname = usePathname();

  if (pathname?.startsWith("/courses/")) {
    return (
      <RouteFallback>
        <DetailPageSkeleton backHref="/courses" backLabel="Back to Courses" />
      </RouteFallback>
    );
  }

  return (
    <RouteFallback>
      <CoursesPageFrame
        isLoading
        totalCount={0}
        itemsPerPage={DEFAULT_ITEMS_PER_PAGE}
      />
    </RouteFallback>
  );
}
