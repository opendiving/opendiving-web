"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * The `?token=` an emailed link arrived with, read once and then taken out of the
 * address bar.
 *
 * The confirm-by-click pages hold a live, single-use credential in their URL until
 * somebody clicks, and the URL is the leakiest place to keep one: history, sync,
 * a screenshot. So it is captured into state on the first render and dropped from
 * the location. State rather than `useSearchParams()` on every render, because Next
 * syncs its router to a native `replaceState` and the next render reads no token.
 *
 * The strip waits a task: Next installs the patch that does that syncing - and that
 * keeps its own history state on the entry - in an effect of its router, which runs
 * after this one. Strict Mode's second effect clears the first's timer, and the URL
 * is read at the time, so the strip happens once either way.
 */
export function useLinkToken(): string | null {
  const searchParams = useSearchParams();
  const [token] = useState(() => searchParams.get("token"));

  useEffect(() => {
    const timer = setTimeout(() => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("token")) return;
      url.searchParams.delete("token");
      window.history.replaceState(null, "", url);
    });
    return () => clearTimeout(timer);
  }, []);

  return token;
}
