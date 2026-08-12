"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { emailAuthSchema, EmailAuthFormData } from "@/lib/validations/auth";
import { getApiErrorMessage } from "@/lib/api/error";
import { rememberPostAuthRedirect } from "@/lib/auth-redirect";
import { cn } from "@/lib/utils";
import { GoogleAuthButton } from "./google-auth-button";
import { ArrowRight, CheckCircle2, MailCheck } from "lucide-react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { StatusMessage } from "@/components/ui/status-message";

interface AuthFormProps {
  className?: string;
  // Where to send the visitor once they're signed in, when they were headed
  // somewhere specific before being bounced to `/signin` (see `useAuthGuard`).
  // Defaults to `/dashboard` at each of the entry points that consume it.
  redirectTo?: string | null;
}

// Client-side throttle on the "Resend link" button, purely for UX (so a signed-out
// visitor gets clear, immediate feedback instead of silently hammering the button).
// The real limit is enforced server-side (see `MagicLinkSettings` in the API's
// `core/config.py`) regardless of anything done here.
const RESEND_COOLDOWN_SECONDS = 30;

// The single entry point into the app: an email address, or "Continue with
// Google" - no password field anywhere. Used both directly on the landing page
// (see `app/page.tsx`) and wherever else a signed-out visitor needs to sign in.
export function AuthForm({ className, redirectTo }: AuthFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const { requestEmailLink } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailAuthFormData>({
    resolver: zodResolver(emailAuthSchema),
  });

  // Ticks `cooldown` down to zero, one second at a time. Scheduling the next tick
  // from inside the timeout callback (rather than an interval tied to mount) means
  // this cleanly stops itself once `cooldown` hits zero, and restarts correctly if
  // `cooldown` is bumped back up by a resend.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const onSubmit = async (data: EmailAuthFormData) => {
    try {
      setError(null);
      // The magic link comes back on `/auth/verify`, which knows nothing about
      // this form - stash the destination for it to pick up. Before the request,
      // not after, so it really is unconditional: with no `redirectTo` this
      // *clears* any destination remembered earlier, and leaving that clear
      // behind a request that might fail is how an abandoned destination
      // resurfaces at an unrelated later sign-in. Storing one for a link that
      // then fails to send costs nothing - the next request overwrites it, and
      // it expires on its own.
      rememberPostAuthRedirect(redirectTo);
      await requestEmailLink(data.email);
      setSentTo(data.email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(
        getApiErrorMessage(err, "Something went wrong. Please try again."),
      );
    }
  };

  const handleUseDifferentEmail = () => {
    setSentTo(null);
    setCooldown(0);
    setResendMessage(null);
    setResendError(null);
  };

  const handleResend = async () => {
    if (!sentTo || cooldown > 0 || isResending) return;

    try {
      setIsResending(true);
      setResendError(null);
      setResendMessage(null);
      // Re-stamped, and for the same reason placed before the request rather
      // than after it. The stored expiry is deliberately blind to how long the
      // backend actually makes links live (see `rememberPostAuthRedirect`), so
      // restamping whenever a new link is minted is the only thing keeping the
      // destination alive for exactly as long as the link the diver is holding.
      rememberPostAuthRedirect(redirectTo);
      await requestEmailLink(sentTo);
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

  if (sentTo) {
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
          We sent a sign-in link to{" "}
          <span className="font-medium text-foreground">{sentTo}</span>. Click
          it to continue - it expires in 30 minutes and can only be used once.
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
            onClick={handleUseDifferentEmail}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Use a different email
          </button>
        </div>
      </div>
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
            {...register("email")}
            className={errors.email ? "border-destructive" : ""}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full bg-coral-solid text-primary-foreground hover:bg-coral-solid/90"
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
      </form>

      <div className="mt-6">
        <GoogleAuthButton onError={setError} redirectTo={redirectTo} />
      </div>
    </div>
  );
}
