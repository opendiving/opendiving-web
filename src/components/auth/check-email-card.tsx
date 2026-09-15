"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  OneTimePasswordField,
  OneTimePasswordFieldInput,
} from "@/components/ui/one-time-password-field";
import { useAuth } from "@/contexts/AuthContext";
import { getApiErrorMessage } from "@/lib/api/error";
import { destinationForOutcome } from "@/lib/auth-redirect";
import { cn } from "@/lib/utils";
import { Loader2, MailCheck } from "lucide-react";
import { StatusMessage } from "@/components/ui/status-message";

interface CheckEmailCardProps {
  className?: string;
  // The heading level for "Check your email". `h3` suits the landing page, where
  // this card swaps in under the hero's own `h1`; `/signin` passes `h1`, because
  // there this card *replaces* the only heading the page has (see `AuthForm`).
  // Only the tag changes - the size is carried by the classes, the same trade
  // `CardTitle`'s `as` makes.
  titleAs?: "h1" | "h3";
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
  titleAs: Title = "h3",
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
  const codeFieldRef = useRef<HTMLDivElement>(null);

  // Radix's roving focus only decides which box is *tabbable*; nothing points the
  // caret at box one on its own. Three moments need it there, so they share this.
  const focusFirstCodeBox = useCallback(() => {
    codeFieldRef.current?.querySelector("input")?.focus();
  }, []);

  // The first of the three, and the only one that is not a recovery: this card
  // replaces the email form outright, taking the submit button the diver just
  // pressed with it, so focus would otherwise fall back to `<body>`. The code is
  // the one thing there is to type here - and a diver reading the email on the
  // device they are already on has nothing else to do with this screen.
  //
  // It moves focus without a gesture of its own, which is the objection to
  // autofocus in general; what makes it the right call here is that the gesture
  // *was* the submit, and this is where that submit led. iOS will not raise the
  // keyboard for a programmatic focus outside the gesture, so there the caret
  // lands and the keyboard waits for a tap - no worse than the `<body>` this
  // replaces.
  useEffect(() => {
    focusFirstCodeBox();
  }, [focusFirstCodeBox]);

  // Puts the caret back in the first box after the value is emptied. Without it
  // focus stays wherever it was - box six, most likely - and Radix will happily
  // write the next digit typed there into position six of an otherwise empty
  // code, which looks like the field is broken.
  const restartCodeEntry = () => {
    setCode("");
    focusFirstCodeBox();
  };

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
      restartCodeEntry();
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
    // The only gate there is. Nothing on screen can be disabled to stop a short
    // code any more - the field submits itself, and Enter submits it too - so this
    // is what keeps a half-typed code from spending one of the five attempts the
    // API allows before the code dies.
    if (!isCodeComplete || isVerifying) return;

    setIsVerifying(true);
    setCodeError(null);
    try {
      const outcome = await verifyEmailCode(requestId, code);
      // Same routing as the Google button, and for the same reason: this never
      // left the tab, so the destination is the prop rather than the stored value
      // `/auth/verify` consumes.
      router.push(destinationForOutcome(outcome.status, redirectTo));
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
      // Emptied rather than left on screen, whatever the failure was, and that is
      // the price of having no submit button. Auto-submit fires on every change to
      // a full field, so a rejected code that stays put turns each keystroke of
      // the correction into another of the five attempts the API allows - six
      // digits retyped over a wrong six would exhaust the row before the last one
      // landed. Retyping into an empty field costs exactly one, and the diver has
      // the email open in front of them either way.
      restartCodeEntry();
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
      <Title className="text-lg font-semibold text-foreground">
        Check your email
      </Title>
      <p className="mt-1 text-sm text-muted-foreground">
        We sent a sign-in link and a six-digit code to{" "}
        <span className="font-medium text-foreground">{email}</span>. Either one
        signs you in - they expire in 30 minutes and can only be used once.
      </p>

      <form onSubmit={handleVerify} className="mt-6 space-y-3 text-left">
        {/* A `<span>` rather than the `Label` component: the field below is a
            `role="group"` of six inputs, not one control, so there is nothing for
            `htmlFor` to point at. `aria-labelledby` names the group instead, and
            each box keeps its own "Character N of 6" label from Radix. */}
        <span
          id="signin-code-label"
          className="block text-sm font-medium leading-none"
        >
          Enter the code from the email
        </span>
        <OneTimePasswordField
          ref={codeFieldRef}
          aria-labelledby="signin-code-label"
          aria-describedby="signin-code-hint"
          value={code}
          onValueChange={setCode}
          // Submits itself once the sixth digit lands, so there is no Verify
          // button to press. `handleVerify` is what holds a short code back.
          autoSubmit
          // Not `disabled`: that drops focus out of the group, and getting it
          // back after a rejection is the diver's problem to solve with a mouse.
          // `readOnly` freezes the digits in place and leaves the caret where
          // they left it.
          readOnly={isVerifying}
        >
          {Array.from({ length: CODE_LENGTH }, (_, index) => (
            // `index` is passed rather than left to the collection to work out, so
            // the boxes are ordered on the server render too and nothing reshuffles
            // at hydration.
            <OneTimePasswordFieldInput key={index} index={index} />
          ))}
        </OneTimePasswordField>
        {/* Rendered unconditionally, because `aria-describedby` above names it:
            swapping it out for the status line below would leave that pointing
            at nothing for as long as a request is in flight. */}
        <p id="signin-code-hint" className="text-xs text-muted-foreground">
          Useful when you&apos;re reading the email on another device.
        </p>
        {isVerifying && (
          // The only sign anything is happening, now that there is no button to
          // put a spinner in. `role="status"` so it is announced rather than only
          // seen.
          <p
            role="status"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking your code...
          </p>
        )}
        {codeError && (
          <StatusMessage variant="error">{codeError}</StatusMessage>
        )}
      </form>

      <div className="mt-6 flex flex-col items-center gap-2 border-t pt-4">
        {resendMessage && (
          <StatusMessage variant="success" className="mb-2 w-full text-left">
            {resendMessage}
          </StatusMessage>
        )}
        {resendError && (
          <StatusMessage variant="error" className="mb-2 w-full text-left">
            {resendError}
          </StatusMessage>
        )}
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
    </div>
  );
}
