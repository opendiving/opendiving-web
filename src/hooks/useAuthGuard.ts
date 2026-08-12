"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { signInHref } from "@/lib/auth-redirect";
import { isLeavingPage } from "@/lib/navigation";

/**
 * Redirects a signed-out user away from a protected page to the sign-in page,
 * but only once the auth check has actually finished — otherwise a page refresh
 * always looks "unauthenticated" for a moment and would incorrectly bounce the
 * user away. Mirrors `useRedirectIfAuthenticated` for the opposite case: pages
 * that require the user to be signed in. Callers should still render nothing
 * (or a loading state) while `isLoading` is true or `isAuthenticated` is false,
 * so the protected content doesn't flash before the redirect happens.
 *
 * The URL being guarded is passed along as `/signin?next=...` so the visitor
 * gets dropped back where they were aiming once they're signed in. It's read
 * from `window.location` inside the effect rather than via `usePathname()`/
 * `useSearchParams()` on purpose: `useSearchParams()` would force every one of
 * the ~15 pages using this hook to grow a `Suspense` boundary or fail the
 * build, and by the time this effect runs there's a real `window` anyway.
 *
 * Pass `redirectTo` to override the destination entirely (no `next` is added).
 *
 * Signing out is the one unauthenticated transition this hook stays out of
 * (`isLeavingPage`). `signOut` clears the user and starts a page load to `/` in
 * the same tick, so this effect can't change where the diver ends up - but
 * without the check it still opens a transition and spends an RSC request on a
 * `/signin` nobody will see, and on a slow link a small RSC payload could beat
 * a full document load and flash the form. Measured on localhost: the request
 * fires, no `replaceState` runs, nothing paints.
 *
 * Navigating Back after signing out *does* reach sign-in, but by reloading the
 * protected page and being bounced on its own merits - the history entry itself
 * is left untouched (verified via `PerformanceNavigationTiming`).
 */
export function useAuthGuard(redirectTo?: string) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || isAuthenticated || isLeavingPage()) return;
    // `replace`, not `push`: the page being bounced from can't be rendered
    // while signed out, so leaving it in the history stack only gives the back
    // button somewhere to land that immediately bounces again.
    router.replace(
      redirectTo ??
        signInHref(window.location.pathname + window.location.search),
    );
  }, [isAuthenticated, isLoading, router, redirectTo]);

  return { user, isAuthenticated, isLoading };
}
