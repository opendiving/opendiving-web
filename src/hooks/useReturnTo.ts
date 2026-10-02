"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  resolveReturnTarget,
  withReturnTo,
  type ReturnTarget,
} from "@/lib/return-to";

/**
 * Reads the destination a form or a record page should return to off the
 * current URL. See `lib/return-to.ts` for the resolution order; `fallback` is
 * where to go when the URL says nothing, which differs per page (the dive list
 * when logging a new dive, the dive itself when editing one, a record's own
 * list).
 *
 * Its callers need no `Suspense` boundary above them. `useSearchParams()` is a
 * context read on the client and suspends only while a *static* shell is being
 * validated at build time, which `export const instant = false` on the root
 * layout switches off for every route in this app. The same holds for
 * `useWithReturnTo` below.
 */
export function useReturnTo(fallback: ReturnTarget): ReturnTarget {
  const searchParams = useSearchParams();

  return resolveReturnTarget(
    {
      from: searchParams.get("from"),
      trip_uuid: searchParams.get("trip_uuid"),
      dive_site_uuid: searchParams.get("dive_site_uuid"),
      course_uuid: searchParams.get("course_uuid"),
    },
    fallback,
  );
}

/**
 * `withReturnTo` bound to the page this renders on: wraps an href so the page
 * it opens can send the diver back here.
 */
export function useWithReturnTo(): (href: string) => string {
  const pathname = usePathname();
  const query = useSearchParams()?.toString();
  const here = pathname && query ? `${pathname}?${query}` : pathname;
  return (href) => withReturnTo(href, here);
}
