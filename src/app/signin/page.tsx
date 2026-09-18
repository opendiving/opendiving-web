"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { StandaloneShell } from "@/components/layout/standalone-shell";
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
  // Not what makes the build pass. `useSearchParams()` is a context read on the
  // client and suspends only while a *static* shell is being validated at build
  // time, which `export const instant = false` on the root layout switches off for
  // every route in this app - see `DECISIONS.md`, "The click paints the
  // destination's frame, and the page is what paints it". Nothing under this
  // boundary suspends, so this fallback never commits.
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
    <StandaloneShell>
      {/* Inside the card rather than above it, so this page reads as one object
          and not as a heading with a form under it - and so the header does not
          jump out of the layout the moment `AuthForm` swaps itself for the
          "check your email" card, which opens with the same block. */}
      <AuthForm
        redirectTo={next}
        title="Sign in"
        description={
          next
            ? "You need to be signed in to view that page."
            : "Enter your email and we'll send you a sign-in link. No password needed."
        }
      />

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
    </StandaloneShell>
  );
}
