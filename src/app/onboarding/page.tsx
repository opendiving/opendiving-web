"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileCompletionForm } from "@/components/auth/ProfileCompletionForm";
import { Logo } from "@/components/logo";

// Profile completion - shared by both authentication methods (email magic link and
// Google). Only reachable with an in-memory onboarding session set by
// `/auth/verify` or the Google button (see `AuthContext`); there is nothing to
// recover if the page is loaded directly (e.g. a refresh), since the session is
// intentionally never persisted - the visitor is sent back to sign in again.
export default function OnboardingPage() {
  const { onboarding, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace("/dashboard");
      return;
    }
    if (!onboarding) {
      router.replace("/");
    }
  }, [onboarding, isAuthenticated, isLoading, router]);

  if (!onboarding) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center space-x-2">
            <Logo className="h-8 w-8 text-coral" />
            <span className="text-2xl font-bold text-foreground">
              OpenDiving
            </span>
          </Link>
        </div>

        <ProfileCompletionForm />

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            By creating an account, you agree to our{" "}
            <Link href="/terms" className="text-primary hover:text-primary/80">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="text-primary hover:text-primary/80"
            >
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
