"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

// Redirects a signed-out user away from a protected page to `redirectTo`
// (the sign in page by default), but only once the auth check has actually
// finished — otherwise a page refresh always looks "unauthenticated" for a
// moment and would incorrectly bounce the user away. Mirrors
// `useRedirectIfAuthenticated` for the opposite case: pages that require the
// user to be signed in. Callers should still render nothing (or a loading
// state) while `isLoading` is true or `isAuthenticated` is false, so the
// protected content doesn't flash before the redirect happens.
export function useAuthGuard(redirectTo: string = "/signin") {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, router, redirectTo]);

  return { user, isAuthenticated, isLoading };
}
