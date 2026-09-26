"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authAPI } from "@/lib/api/auth";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { StandaloneShell } from "@/components/layout/standalone-shell";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  MailCheck,
} from "lucide-react";

// What the email-change confirmation link actually points to
// (`{FRONTEND_URL}/settings/confirm-email?token=...`, see the backend's
// `services.email_service.send_email_change_confirmation_email`). Mirrors the
// sign-up flow's own protection: completing a new account requires a real user to
// submit the profile-completion form, which naturally can't be done by automation -
// so this page requires an explicit "Confirm" click before the
// `POST /user/email-change/verify` call that actually applies the change ever fires.
// A mail client's link-preview/security-scanning feature (which may render this page
// in a real, JS-executing browser) can load it, but it can't fake a real click, so
// the token isn't touched until an actual person acts.
//
// Before showing that button at all, a side-effect-free `GET .../verify/check` call
// determines whether the link is even still live - this is what actually keeps a
// revisit (e.g. via the browser's back button after already confirming) from
// showing a misleadingly clickable button, and lets us show the target email up
// front. The backend's idempotent handling of an already-used-but-not-superseded
// token (see the API's `DECISIONS.md`) is still in place as defense-in-depth for
// races, but isn't relied on as the primary defense.
export default function ConfirmEmailChangePage() {
  return (
    <Suspense fallback={<ConfirmStatus state="checking" />}>
      <ConfirmEmailChangeContent />
    </Suspense>
  );
}

type ConfirmState = "checking" | "ready" | "verifying" | "success" | "error";

function ConfirmEmailChangeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const token = searchParams.get("token");
  const [state, setState] = useState<ConfirmState>(
    token ? "checking" : "error",
  );
  const [message, setMessage] = useState<string | null>(
    token ? null : "This confirmation link is missing its token.",
  );
  const [email, setEmail] = useState<string | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!token || checkedRef.current) return;
    checkedRef.current = true;

    authAPI
      .checkEmailChangeLink(token)
      .then((result) => {
        if (!result.valid) {
          setMessage(
            "This confirmation link has already been used, or is invalid or expired.",
          );
          setState("error");
          return;
        }
        setEmail(result.email ?? null);
        setState("ready");
      })
      .catch((err) => {
        setMessage(
          getApiErrorMessage(
            err,
            "This confirmation link is invalid or has expired.",
          ),
        );
        setState("error");
      });
  }, [token]);

  // Once confirmed, there's nothing more for the user to do here - send them back
  // to settings on their own after a moment, rather than leaving them stranded on
  // this standalone confirmation page (the "Back to settings" link still covers
  // anyone who wants to leave sooner).
  useEffect(() => {
    if (state !== "success") return;
    const timer = setTimeout(() => router.push("/settings/account"), 3000);
    return () => clearTimeout(timer);
  }, [state, router]);

  const handleConfirm = async () => {
    if (!token) return;

    setState("verifying");
    try {
      const result = await authAPI.verifyEmailChange(token);
      setEmail(result.email);
      setState("success");
      // Only meaningfully updates anything if the visitor happens to still be
      // signed in in this browser/tab - harmless no-op otherwise.
      await refreshUser();
    } catch (err) {
      setMessage(
        getApiErrorMessage(
          err,
          "This confirmation link is invalid or has expired.",
        ),
      );
      setState("error");
    }
  };

  return (
    <ConfirmStatus
      state={state}
      message={message}
      email={email}
      onConfirm={handleConfirm}
    />
  );
}

function ConfirmStatus({
  state,
  message,
  email,
  onConfirm,
}: {
  state: ConfirmState;
  message?: string | null;
  email?: string | null;
  onConfirm?: () => void;
}) {
  return (
    <StandaloneShell className="text-center">
      {state === "checking" && (
        <>
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">
            Checking your confirmation link...
          </p>
        </>
      )}

      {state === "ready" && (
        <>
          <MailCheck className="mx-auto mb-4 h-10 w-10 text-primary" />
          <p className="text-foreground font-medium mb-1">
            Confirm your new email address
          </p>
          <p className="text-muted-foreground mb-6">
            {email ? (
              <>
                Click below to change your account&apos;s email to{" "}
                <span className="font-medium text-foreground">{email}</span>.
              </>
            ) : (
              "Click below to finish changing your account's email."
            )}
          </p>
          <Button onClick={onConfirm}>
            <Check className="h-4 w-4 mr-2" />
            Confirm email change
          </Button>
        </>
      )}

      {state === "verifying" && (
        <>
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Confirming your new email...</p>
        </>
      )}

      {state === "success" && (
        <>
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-success" />
          <p className="text-foreground font-medium mb-1">All set!</p>
          <p className="text-muted-foreground mb-6">
            Your email address has been updated
            {email && (
              <>
                {" "}
                to <span className="font-medium text-foreground">{email}</span>
              </>
            )}
            .
          </p>
          <Link
            href="/settings/account"
            className="underline hover:text-foreground"
          >
            Back to settings
          </Link>
        </>
      )}

      {state === "error" && (
        <>
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" />
          <p className="text-foreground font-medium mb-1">
            We couldn&apos;t confirm your email
          </p>
          <p className="text-muted-foreground mb-6">{message}</p>
          <Link
            href="/settings/account"
            className="underline hover:text-foreground"
          >
            Back to settings
          </Link>
        </>
      )}
    </StandaloneShell>
  );
}
