"use client";

import { usePathname } from "next/navigation";

import { RouteFallback } from "@/components/ui/route-fallback";
import {
  DetailPageSkeleton,
  FormPageSkeleton,
} from "@/components/ui/page-skeleton";
import { DivesPageFrame } from "@/components/dives/dives-page-frame";
import { DEFAULT_ITEMS_PER_PAGE } from "@/hooks/useInfiniteResource";
import { useReturnTo } from "@/hooks/useReturnTo";

/**
 * The frame for whichever of the four `dives` destinations the click is going
 * to. The boundary is keyed on the child segment, so one file covers the log,
 * the two form pages and every dive under it; the destination comes off the URL
 * the navigation is going to rather than the one it left.
 *
 * The two form pages take their back link from the URL, through the same hook
 * and the same per-form default the pages use, so the link does not change under
 * the diver a round trip later.
 */
export default function DivesLoading() {
  const pathname = usePathname() ?? "";
  const segments = pathname.split("/").filter(Boolean);
  const isNew = segments[1] === "new";
  const isEdit = segments.length === 3 && segments[2] === "edit";

  const returnTo = useReturnTo(
    isEdit
      ? { href: `/dives/${segments[1]}`, label: "Back to dive" }
      : { href: "/dives", label: "Back to dives" },
  );

  if (isNew || isEdit) {
    return (
      <RouteFallback>
        {/* Eight fields for both, not the six-field default: they render the
            same form, whose first card is date, duration, depths, temperature,
            site and trip above the fold. */}
        <FormPageSkeleton
          backHref={returnTo.href}
          backLabel={returnTo.label}
          fields={8}
        />
      </RouteFallback>
    );
  }

  if (segments.length > 1) {
    return (
      <RouteFallback>
        <DetailPageSkeleton backHref="/dives" backLabel="Back to dives" />
      </RouteFallback>
    );
  }

  return (
    <RouteFallback>
      <DivesPageFrame
        isLoading
        totalCount={0}
        itemsPerPage={DEFAULT_ITEMS_PER_PAGE}
      />
    </RouteFallback>
  );
}
