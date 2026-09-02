"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { RestoreAccountCard } from "@/components/auth/restore-account-card";
import { StandaloneShell } from "@/components/layout/standalone-shell";

// The account-restore screen, and the exact counterpart of `/onboarding`: both are
// what a verified identity that is not yet a session gets shown, and both are only
// reachable with an in-memory session set by one of the four entry points (see
// `RestoreSession` in `AuthContext`). Loading it directly - a refresh, a bookmark -
// recovers nothing, because that state is deliberately never persisted, so the
// visitor is sent back to the landing page to sign in again.
//
// The magic-link path is the one that usually does not come here: its precheck has
// already labelled the button *Restore my account*, so `/auth/verify` chains both
// halves itself. This screen serves the three paths with no precheck - the six-digit
// code, Google and a passkey - where the offer can only be made after the POST.
export default function RestorePage() {
  const { restore, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace("/dashboard");
      return;
    }
    if (!restore) {
      router.replace("/");
    }
  }, [restore, isAuthenticated, isLoading, router]);

  if (!restore) {
    return null;
  }

  return (
    <StandaloneShell>
      <RestoreAccountCard />
    </StandaloneShell>
  );
}
