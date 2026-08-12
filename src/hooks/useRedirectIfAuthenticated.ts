"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Redirects an already-authenticated user away from a public-only page
 * (e.g. the landing page, sign in, sign up) to `redirectTo`. Returns
 * `isAuthenticated`/`isLoading` so the caller can render a loading state (or
 * nothing) until the auth check settles and/or the redirect happens, instead
 * of briefly flashing the public page's content to a logged-in user.
 */
export function useRedirectIfAuthenticated(redirectTo: string = "/dashboard") {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, router, redirectTo]);

  return { isAuthenticated, isLoading };
}
