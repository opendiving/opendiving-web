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
  consumePostAuthRedirect,
  destinationForOutcome,
} from "@/lib/auth-redirect";
import { formatPurgeDay, parsePurgeDate } from "@/lib/purge-date";
import {
  AlertCircle,
  CalendarClock,
  Loader2,
  LogIn,
  MailCheck,
  RotateCcw,
} from "lucide-react";

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
//
// That same precheck is what makes this the one entry point of four whose button can
// tell the truth about a deleted account *before* anything is spent: it answers
// `deletion_pending` alongside the date, and the button then reads "Restore my
// account". The code, Google and passkey paths have no such look-before-you-click
// step, so they show the offer on `/restore` after their POST returns.
export default function VerifyMagicLinkPage() {
  return (
    <Suspense fallback={<VerifyStatus state="checking" />}>
      <VerifyMagicLinkContent />
    </Suspense>
  );
}

type VerifyState =
  "checking" | "ready" | "restore" | "verifying" | "restoring" | "error";

const LINK_FAILED = "This sign-in link is invalid or has expired.";
const RESTORE_FAILED = "Couldn't restore your account. Please try again.";

function VerifyMagicLinkContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { verifyEmailLink, restoreAccount } = useAuth();
  const token = searchParams.get("token");
  const [state, setState] = useState<VerifyState>(token ? "checking" : "error");
  const [error, setError] = useState<string | null>(
    token ? null : "This sign-in link is missing its token.",
  );
  const [email, setEmail] = useState<string | null>(null);
  // Set by the precheck for a link into an account inside its grace period, and
  // never cleared afterwards: it decides what the button does, and then what the
  // error card says if that fails. Null `purgeAfter` is the API's answer for a row
  // flagged with no clock to count from - the offer stands without a date on it.
  const [pendingDeletion, setPendingDeletion] = useState<{
    purgeAfter: string | null;
  } | null>(null);
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
        // `deletion_pending` rides on `valid: true` - the link works, it just
        // leads somewhere else - which is why this branch sits after the one
        // above rather than in front of it.
        if (result.deletion_pending) {
          setPendingDeletion({ purgeAfter: result.purge_after ?? null });
          setState("restore");
          return;
        }
        setState("ready");
      })
      .catch((err) => {
        setError(getApiErrorMessage(err, LINK_FAILED));
        setState("error");
      });
  }, [token]);

  const handleConfirm = async () => {
    if (!token) return;

    // Read before the state changes below, and what tells the two clicks apart for
    // the rest of this handler.
    const restoring = state === "restore";
    setState(restoring ? "restoring" : "verifying");
    try {
      const outcome = await verifyEmailLink(token);
      // Consumed unconditionally, even when heading to onboarding: a brand-new
      // account has nothing to return to, and leaving the value behind would
      // only let it surface at some unrelated later sign-in in this tab.
      const next = consumePostAuthRedirect();

      // The button said "Restore my account" and it was clicked, so the decision
      // this feature exists to ask for has been made - chaining straight into the
      // second half is that decision being carried out, not a step being skipped.
      // The `status` check is not a formality: a deletion requested between the
      // precheck and the click arrives here too, and a click on a button that said
      // "Sign in" must never silently restore anything. That case falls through to
      // `/restore`, where the offer is made properly.
      if (restoring && outcome.status === "deletion_pending") {
        await restoreAccount(outcome.restore_token!);
        router.replace(destinationForOutcome("authenticated", next));
        return;
      }
      router.replace(destinationForOutcome(outcome.status, next));
    } catch (err) {
      setError(
        getApiErrorMessage(err, restoring ? RESTORE_FAILED : LINK_FAILED),
      );
      setState("error");
    }
  };

  return (
    <VerifyStatus
      state={state}
      error={error}
      email={email}
      pendingDeletion={pendingDeletion}
      onConfirm={handleConfirm}
    />
  );
}

function VerifyStatus({
  state,
  error,
  email,
  pendingDeletion,
  onConfirm,
}: {
  state: VerifyState;
  error?: string | null;
  email?: string | null;
  pendingDeletion?: { purgeAfter: string | null } | null;
  onConfirm?: () => void;
}) {
  const purgeOn = parsePurgeDate(pendingDeletion?.purgeAfter);

  return (
    <StandaloneShell className="text-center">
      {state === "checking" && (
        <>
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Checking your sign-in link...</p>
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

      {state === "restore" && (
        <>
          <CalendarClock
            className="mx-auto mb-4 h-10 w-10 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-foreground font-medium mb-1">
            This account is scheduled for deletion
          </p>
          <p className="text-muted-foreground mb-6">
            {email ? (
              <>
                <span className="font-medium text-foreground">{email}</span> was
                deleted, and nothing has been erased yet.
              </>
            ) : (
              "This account was deleted, and nothing has been erased yet."
            )}{" "}
            {purgeOn ? (
              <>
                Restoring brings back your dives, dive sites, trips, courses,
                certifications and gear and signs you in. After{" "}
                <span className="font-medium text-foreground">
                  {formatPurgeDay(purgeOn)}
                </span>{" "}
                nothing can be restored.
              </>
            ) : (
              "Restoring brings back your dives, dive sites, trips, courses, certifications and gear and signs you in. Once the erasure date passes, nothing can be restored."
            )}
          </p>
          <Button onClick={onConfirm}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restore my account
          </Button>
        </>
      )}

      {state === "verifying" && (
        <>
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Signing you in...</p>
        </>
      )}

      {state === "restoring" && (
        <>
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Restoring your account...</p>
        </>
      )}

      {state === "error" && (
        <>
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" />
          <p className="text-foreground font-medium mb-1">
            {pendingDeletion
              ? "We couldn't restore your account"
              : "We couldn't sign you in"}
          </p>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Link href="/signin" className="underline hover:text-foreground">
            Request a new sign-in link
          </Link>
        </>
      )}
    </StandaloneShell>
  );
}
