"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authAPI } from "@/lib/api/auth";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  consumePostAuthRedirect,
  DEFAULT_POST_AUTH_REDIRECT,
} from "@/lib/auth-redirect";
import { AlertCircle, Loader2, LogIn, MailCheck } from "lucide-react";

// The magic-link landing page - this is what `{FRONTEND_URL}/auth/verify?token=...`
// (see the backend's `services.email_service`) actually points to. Mirrors the
// sign-up flow's own protection: completing a new account requires a real user to
// submit the profile-completion form (`/onboarding`), which naturally can't be done
// by automation - so this page requires an explicit "Sign in" click before the
// `POST /auth/email/verify` call that actually signs the caller in ever fires. A
// mail client's link-preview/security-scanning feature (which may render this page
// in a real, JS-executing browser) can load it, but it can't fake a real click, so
// the token isn't touched until an actual person acts.
//
// Before showing that button at all, a side-effect-free `GET .../verify/check` call
// determines whether the link is even still live - this is what actually keeps a
// revisit (e.g. via the browser's back button after already signing in) from
// showing a misleadingly clickable button. The backend's idempotent handling of an
// already-used-but-not-superseded token (see the API's `DECISIONS.md`) is still in
// place as defense-in-depth for races, but isn't relied on as the primary defense.
export default function VerifyMagicLinkPage() {
  return (
    <Suspense fallback={<VerifyStatus state="checking" />}>
      <VerifyMagicLinkContent />
    </Suspense>
  );
}

type VerifyState = "checking" | "ready" | "verifying" | "error";

function VerifyMagicLinkContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { verifyEmailLink } = useAuth();
  const token = searchParams.get("token");
  const [state, setState] = useState<VerifyState>(token ? "checking" : "error");
  const [error, setError] = useState<string | null>(
    token ? null : "This sign-in link is missing its token.",
  );
  const [email, setEmail] = useState<string | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!token || checkedRef.current) return;
    checkedRef.current = true;

    authAPI
      .checkEmailLink(token)
      .then((result) => {
        if (!result.valid) {
          setError(
            "This sign-in link has already been used, or is invalid or expired.",
          );
          setState("error");
          return;
        }
        setEmail(result.email ?? null);
        setState("ready");
      })
      .catch((err) => {
        setError(
          getApiErrorMessage(
            err,
            "This sign-in link is invalid or has expired.",
          ),
        );
        setState("error");
      });
  }, [token]);

  const handleConfirm = async () => {
    if (!token) return;

    setState("verifying");
    try {
      const signedIn = await verifyEmailLink(token);
      // Consumed unconditionally, even when heading to onboarding: a brand-new
      // account has nothing to return to, and leaving the value behind would
      // only let it surface at some unrelated later sign-in in this tab.
      const next = consumePostAuthRedirect();
      router.replace(
        signedIn ? (next ?? DEFAULT_POST_AUTH_REDIRECT) : "/onboarding",
      );
    } catch (err) {
      setError(
        getApiErrorMessage(err, "This sign-in link is invalid or has expired."),
      );
      setState("error");
    }
  };

  return (
    <VerifyStatus
      state={state}
      error={error}
      email={email}
      onConfirm={handleConfirm}
    />
  );
}

function VerifyStatus({
  state,
  error,
  email,
  onConfirm,
}: {
  state: VerifyState;
  error?: string | null;
  email?: string | null;
  onConfirm?: () => void;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center space-x-2">
            <Logo className="h-8 w-8 text-coral" />
            <span className="text-2xl font-bold text-foreground">
              OpenDiving
            </span>
          </Link>
        </div>

        {state === "checking" && (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">
              Checking your sign-in link...
            </p>
          </>
        )}

        {state === "ready" && (
          <>
            <MailCheck className="mx-auto mb-4 h-10 w-10 text-primary" />
            <p className="text-foreground font-medium mb-1">
              Ready to sign you in
            </p>
            <p className="text-muted-foreground mb-6">
              {email ? (
                <>
                  Click below to sign in as{" "}
                  <span className="font-medium text-foreground">{email}</span>.
                </>
              ) : (
                "Click below to finish signing in to OpenDiving."
              )}
            </p>
            <Button onClick={onConfirm}>
              <LogIn className="h-4 w-4 mr-2" />
              Sign in
            </Button>
          </>
        )}

        {state === "verifying" && (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Signing you in...</p>
          </>
        )}

        {state === "error" && (
          <>
            <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" />
            <p className="text-foreground font-medium mb-1">
              We couldn&apos;t sign you in
            </p>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Link href="/signin" className="underline hover:text-foreground">
              Request a new sign-in link
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
