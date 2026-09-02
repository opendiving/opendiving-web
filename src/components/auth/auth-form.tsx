"use client";

import React, { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useConfig } from "@/contexts/ConfigContext";
import { usePasskeySignIn } from "@/hooks/usePasskeySignIn";
import { emailAuthSchema, EmailAuthFormData } from "@/lib/validations/auth";
import { getApiErrorMessage } from "@/lib/api/error";
import { rememberPostAuthRedirect } from "@/lib/auth-redirect";
import { cn } from "@/lib/utils";
import { CheckEmailCard } from "./check-email-card";
import { GoogleAuthButton } from "./google-auth-button";
import { ArrowRight, KeyRound } from "lucide-react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { StatusMessage } from "@/components/ui/status-message";

interface AuthFormProps {
  className?: string;
  // Where to send the visitor once they're signed in, when they were headed
  // somewhere specific before being bounced to `/signin` (see `useAuthGuard`).
  // Defaults to `/dashboard` at each of the entry points that consume it.
  redirectTo?: string | null;
}

// What the "check your email" card needs, and the reason it is one value rather
// than two pieces of state: the code in the email can only be verified against the
// request that produced it (see `CheckEmailCard`), so the address on screen and the
// id being verified must never disagree. A resend replaces both together; closing
// the tab loses them, and asking for another link is the way back.
interface SentLink {
  email: string;
  requestId: string;
}

// The single entry point into the app: an email address, "Continue with Google",
// or a passkey - no password field anywhere. Used both directly on the landing
// page (see `app/page.tsx`) and wherever else a signed-out visitor needs to sign
// in.
//
// Passkeys reach this form twice over. The explicit button below is the visible
// half; the invisible one is a ceremony armed on mount, which puts the diver's
// passkey in the browser's own autofill dropdown on the email field. That arms on
// the landing page as well, deliberately: the hero *is* the sign-in surface for a
// returning visitor, and one tap from there beats a round trip through an inbox.
export function AuthForm({ className, redirectTo }: AuthFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentLink | null>(null);
  const { requestEmailLink } = useAuth();
  const { googleClientId } = useConfig();
  // Armed only while the email input is on screen: the browser anchors its
  // autofill dropdown to that field, and `CheckEmailCard` replaces this whole
  // form once a link has been sent.
  const passkey = usePasskeySignIn({
    autofill: !sent,
    redirectTo,
    onError: setError,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailAuthFormData>({
    resolver: zodResolver(emailAuthSchema),
  });

  // The one place a link is minted, for the first request and every resend alike.
  const sendLink = useCallback(
    async (email: string) => {
      // The magic link comes back on `/auth/verify`, which knows nothing about
      // this form - stash the destination for it to pick up. Before the request,
      // not after, so it really is unconditional: with no `redirectTo` this
      // *clears* any destination remembered earlier, and leaving that clear
      // behind a request that might fail is how an abandoned destination
      // resurfaces at an unrelated later sign-in. Storing one for a link that
      // then fails to send costs nothing - the next request overwrites it, and
      // it expires on its own.
      //
      // Re-stamped on a resend too. The stored expiry is deliberately blind to
      // how long the backend actually makes links live (see
      // `rememberPostAuthRedirect`), so restamping whenever a new link is minted
      // is the only thing keeping the destination alive for exactly as long as
      // the link the diver is holding.
      rememberPostAuthRedirect(redirectTo);
      const { request_id } = await requestEmailLink(email);
      setSent({ email, requestId: request_id });
    },
    [redirectTo, requestEmailLink],
  );

  const onSubmit = async (data: EmailAuthFormData) => {
    try {
      setError(null);
      await sendLink(data.email);
    } catch (err) {
      setError(
        getApiErrorMessage(err, "Something went wrong. Please try again."),
      );
    }
  };

  if (sent) {
    return (
      <CheckEmailCard
        className={className}
        email={sent.email}
        requestId={sent.requestId}
        redirectTo={redirectTo}
        onResend={() => sendLink(sent.email)}
        onUseDifferentEmail={() => setSent(null)}
      />
    );
  }

  return (
    <div
      className={cn(
        "w-full max-w-md rounded-lg border bg-card p-6 shadow-sm",
        className,
      )}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <StatusMessage variant="error">{error}</StatusMessage>}

        <div className="space-y-2 text-left">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            // `username` is the plain autofill hint this field always wanted;
            // `webauthn` is what lets the browser offer a passkey in the same
            // dropdown, and what `startAuthentication({useBrowserAutofill})`
            // looks for before it will arm a conditional ceremony at all.
            autoComplete="username webauthn"
            {...register("email")}
            className={errors.email ? "border-destructive" : ""}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full bg-coral text-primary-foreground hover:bg-coral/90"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <div className="flex items-center space-x-2">
              <ButtonSpinner />
              <span>Sending...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <span>Sign In</span>
              <ArrowRight size={16} />
            </div>
          )}
        </Button>

        {/* The rolling-window phrasing is load-bearing, not padding: the refresh
            cookie is re-issued on every use, so "for a week" would be false for
            anyone who keeps using the app. This is where a diver is told that
            signing in persists past the tab; `/privacy` §10.1 has the long
            version.

            "About a week" is hardcoded prose for a number the API configures
            (`REFRESH_TOKEN_EXPIRE_DAYS`, default 7), so an instance that changes
            it makes this line and §10.1 drift. That coupling is accepted rather
            than guarded - the same trade as the privacy page's "within 30 days"
            against the deletion grace period, which the API docs do warn about.
            Nothing warns about this one yet. */}
        <p className="text-xs text-muted-foreground">
          Signing in keeps you signed in on this browser until about a week goes
          by without you using OpenDiving.
        </p>
      </form>

      {/* The divider lives here rather than inside `GoogleAuthButton`, because
          there is more than one alternative method now and it has to be drawn
          once above whichever of them this instance actually has. Google hides
          itself when unconfigured and the passkey button when the browser has no
          WebAuthn, so with neither present this whole block goes with them. */}
      {(googleClientId || passkey.supported) && (
        <div className="mt-6 space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <GoogleAuthButton onError={setError} redirectTo={redirectTo} />

          {passkey.supported && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={passkey.signIn}
              disabled={passkey.isSigningIn}
            >
              {passkey.isSigningIn ? (
                <div className="flex items-center space-x-2">
                  <ButtonSpinner />
                  <span>Signing in...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <KeyRound size={16} />
                  {/* "Sign in", not "Continue": a passkey can only ever sign in
                      an account that already exists. */}
                  <span>Sign in with a passkey</span>
                </div>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
