"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { Logo } from "@/components/logo";
import { PageSpinner } from "@/components/ui/page-spinner";
import { useRedirectIfAuthenticated } from "@/hooks/useRedirectIfAuthenticated";
import {
  DEFAULT_POST_AUTH_REDIRECT,
  sanitizeRedirectPath,
} from "@/lib/auth-redirect";

// The dedicated sign-in surface. The landing page still hosts an `AuthForm` of
// its own in its hero section, but a signed-out visitor who lands on a
// protected URL needs somewhere to be sent that is *about* signing in - and
// somewhere that can carry where they were headed (`?next=`) through the sign-in
// round trip. `useAuthGuard` bounces every protected page here.
//
// Chrome-free (see `NO_CHROME_ROUTES` in `app-shell.tsx`), matching the other
// two auth-flow pages (`/auth/verify`, `/onboarding`): a centered card with the
// logo as the only way back out.
export default function SignInPage() {
  // `useSearchParams` needs a Suspense boundary above it or the build fails on
  // this page's prerender - same shape as `/auth/verify`.
  return (
    <Suspense fallback={<PageSpinner />}>
      <SignInContent />
    </Suspense>
  );
}

function SignInContent() {
  const searchParams = useSearchParams();
  const next = sanitizeRedirectPath(searchParams.get("next"));
  // Someone already signed in has no business here - send them straight on to
  // wherever they were headed.
  const { isAuthenticated, isLoading } = useRedirectIfAuthenticated(
    next ?? DEFAULT_POST_AUTH_REDIRECT,
  );

  if (isLoading || isAuthenticated) {
    return <PageSpinner />;
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

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {next
              ? "You need to be signed in to view that page."
              : "Enter your email and we'll send you a sign-in link. No password needed."}
          </p>
        </div>

        <AuthForm redirectTo={next} />

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            By signing in, you agree to our{" "}
            <Link href="/terms" className="underline hover:text-foreground">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
