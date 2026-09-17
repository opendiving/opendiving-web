"use client";

import { CertificationsPageFrame } from "@/components/certifications/certifications-page-frame";
import { RouteFallback } from "@/components/ui/route-fallback";
import { DEFAULT_ITEMS_PER_PAGE } from "@/hooks/useInfiniteResource";

// `/certifications` is the whole segment, so this fallback needs no destination
// switch.
export default function CertificationsLoading() {
  return (
    <RouteFallback>
      <CertificationsPageFrame
        isLoading
        totalCount={0}
        itemsPerPage={DEFAULT_ITEMS_PER_PAGE}
      />
    </RouteFallback>
  );
}
