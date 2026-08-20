"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  DEFAULT_POST_AUTH_REDIRECT,
  sanitizeRedirectPath,
} from "@/lib/auth-redirect";
import { cn } from "@/lib/utils";
import { MailCheck } from "lucide-react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { StatusMessage } from "@/components/ui/status-message";

interface CheckEmailCardProps {
  className?: string;
  // The address the email just went to, shown back to the diver so a typo is
  // obvious before they go looking in the wrong inbox.
  email: string;
  // Names the request row the email is about (see `requestEmailLink`). The code
  // cannot be verified without it, and a resend replaces it - so this is always
  // the id belonging to the newest email sent.
  requestId: string;
  // Where to land once the code signs them in. Unlike the link - which comes back
  // on `/auth/verify` in whatever browser opened it, and reads its destination out
  // of `localStorage` - the code is typed right here, so this is just a prop.
  redirectTo?: string | null;
  // Mints a fresh link (and code) for the same address. Owned by `AuthForm`, which
  // holds the `requestId` this card is handed.
  onResend: () => Promise<void>;
  onUseDifferentEmail: () => void;
}

// Client-side throttle on the "Resend link" button, purely for UX (so a signed-out
// visitor gets clear, immediate feedback instead of silently hammering the button).
// The real limit is enforced server-side (see `MagicLinkSettings` in the API's
// `core/config.py`) regardless of anything done here.
const RESEND_COOLDOWN_SECONDS = 30;

const CODE_LENGTH = 6;

// The email prints the code spaced - "481 052" - so a paste carries a space, and
// anything that isn't a digit is dropped rather than rejected. Note what is *not*
// here: a `maxLength` on the input would truncate that same paste to "481 05"
// before this ever ran, losing the last digit.
function normalizeCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

// The "a link is on its way" half of `AuthForm`, and the one screen where the code
// from that same email can be typed.
//
// The code exists for the case the link cannot serve: a link signs in *the device
// that opens it*, so a diver who typed their address on a desktop and reads mail on
// their phone ends up signed in inside the phone's mail-app browser. A code crosses
// that gap by hand. Both are backed by the same request row on the API side, so
// whichever is used first consumes it and the other stops working.
export function CheckEmailCard({
  className,
  email,
  requestId,
  redirectTo,
  onResend,
  onUseDifferentEmail,
}: CheckEmailCardProps) {
  // This card is only ever mounted right after a link was sent, so the cooldown
  // starts spent rather than being armed by whoever renders it.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const { verifyEmailCode } = useAuth();
  const router = useRouter();

  // Ticks `cooldown` down to zero, one second at a time. Scheduling the next tick
  // from inside the timeout callback (rather than an interval tied to mount) means
  // this cleanly stops itself once `cooldown` hits zero, and restarts correctly if
  // `cooldown` is bumped back up by a resend.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;

    try {
      setIsResending(true);
      setResendError(null);
      setResendMessage(null);
      await onResend();
      // A resend supersedes the previous request row, so whatever was half-typed
      // is a code for an email that no longer signs anyone in - clearing it beats
      // letting the diver submit it and be told it's invalid.
      setCode("");
      setCodeError(null);
      setResendMessage("Link resent - check your email.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setResendError(
        getApiErrorMessage(err, "Couldn't resend the link. Please try again."),
      );
    } finally {
      setIsResending(false);
    }
  };

  const isCodeComplete = code.length === CODE_LENGTH;

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isCodeComplete || isVerifying) return;

    setIsVerifying(true);
    setCodeError(null);
    try {
      const signedIn = await verifyEmailCode(requestId, code);
      // Same routing as the Google button, and for the same reason: this never
      // left the tab, so the destination is the prop rather than the stored value
      // `/auth/verify` consumes.
      router.push(
        signedIn
          ? (sanitizeRedirectPath(redirectTo) ?? DEFAULT_POST_AUTH_REDIRECT)
          : "/onboarding",
      );
      // Deliberately still `isVerifying` here: the navigation is under way, and
      // re-enabling the button would only invite a second submission of a code
      // that has already been consumed.
    } catch (err) {
      // The fallback deliberately does not say the code was wrong. It only shows
      // when the failure carried no `detail` at all - a dropped connection, a 500 -
      // where the code may well be fine and "that code is invalid" would send the
      // diver off to request another email for no reason.
      setCodeError(
        getApiErrorMessage(err, "Couldn't check that code. Please try again."),
      );
      setIsVerifying(false);
    }
  };

  return (
    <div
      className={cn(
        "w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm",
        className,
      )}
    >
      <MailCheck className="mx-auto mb-3 h-10 w-10 text-primary" />
      <h3 className="text-lg font-semibold text-foreground">
        Check your email
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        We sent a sign-in link and a six-digit code to{" "}
        <span className="font-medium text-foreground">{email}</span>. Either one
        signs you in - they expire in 30 minutes and can only be used once.
      </p>

      {resendMessage && (
        <StatusMessage variant="success" className="mt-4">
          {resendMessage}
        </StatusMessage>
      )}
      {resendError && (
        <StatusMessage variant="error">{resendError}</StatusMessage>
      )}

      <div className="mt-4 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || isResending}
          className="text-sm font-medium underline hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:text-muted-foreground"
        >
          {isResending
            ? "Resending..."
            : cooldown > 0
              ? `Resend link in ${cooldown}s`
              : "Resend link"}
        </button>
        <button
          type="button"
          onClick={onUseDifferentEmail}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Use a different email
        </button>
      </div>

      <form
        onSubmit={handleVerify}
        className="mt-6 space-y-2 border-t pt-4 text-left"
      >
        <Label htmlFor="signin-code">Or enter the code from the email</Label>
        <div className="flex gap-2">
          <Input
            id="signin-code"
            type="text"
            inputMode="numeric"
            // Lets a browser that can read the code out of the email offer it,
            // rather than making the diver switch apps to copy six digits.
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(normalizeCode(event.target.value))}
            className="tracking-[0.3em]"
          />
          {/* Held closed until all six digits are in: the API allows five wrong
              attempts before the code dies, and a half-typed submission would
              spend one of them for nothing. */}
          <Button
            type="submit"
            variant="outline"
            disabled={!isCodeComplete || isVerifying}
          >
            {isVerifying ? (
              <div className="flex items-center space-x-2">
                <ButtonSpinner />
                <span>Verifying...</span>
              </div>
            ) : (
              "Verify"
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Useful when you&apos;re reading the email on another device.
        </p>
        {codeError && (
          <StatusMessage variant="error">{codeError}</StatusMessage>
        )}
      </form>
    </div>
  );
}
