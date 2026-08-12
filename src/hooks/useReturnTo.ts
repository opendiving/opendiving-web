"use client";

import { useSearchParams } from "next/navigation";
import { resolveReturnTarget, type ReturnTarget } from "@/lib/return-to";

/**
 * Reads the destination a form should return to off the current URL. See
 * `lib/return-to.ts` for the resolution order; `fallback` is where to go when
 * the URL says nothing, which differs per form (the dive list when logging a
 * new dive, the dive itself when editing one).
 */
export function useReturnTo(fallback: ReturnTarget): ReturnTarget {
  const searchParams = useSearchParams();

  return resolveReturnTarget(
    {
      from: searchParams.get("from"),
      trip_uuid: searchParams.get("trip_uuid"),
      dive_site_uuid: searchParams.get("dive_site_uuid"),
    },
    fallback,
  );
}
