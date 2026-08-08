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
import { cn } from "@/lib/utils";
import { GoogleAuthButton } from "./GoogleAuthButton";
import { ArrowRight, CheckCircle2, MailCheck } from "lucide-react";

interface AuthFormProps {
  className?: string;
}

// Client-side throttle on the "Resend link" button, purely for UX (so a signed-out
// visitor gets clear, immediate feedback instead of silently hammering the button).
// The real limit is enforced server-side (see `MagicLinkSettings` in the API's
// `core/config.py`) regardless of anything done here.
const RESEND_COOLDOWN_SECONDS = 30;

// The single entry point into the app: an email address, or "Continue with
// Google" - no password field anywhere. Used both directly on the landing page
// (see `app/page.tsx`) and wherever else a signed-out visitor needs to sign in.
export function AuthForm({ className }: AuthFormProps) {
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
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 size={16} />
            <span>{resendMessage}</span>
          </div>
        )}
        {resendError && (
          <div className="mt-4 p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-md border border-red-200 dark:border-red-900">
            {resendError}
          </div>
        )}

        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || isResending}
            className="text-sm font-medium text-primary hover:text-primary/80 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:text-muted-foreground"
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
        {error && (
          <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-md border border-red-200 dark:border-red-900">
            {error}
          </div>
        )}

        <div className="space-y-2 text-left">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            {...register("email")}
            className={errors.email ? "border-red-500" : ""}
          />
          {errors.email && (
            <p className="text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full bg-coral text-white hover:bg-coral/90"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
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
        <GoogleAuthButton onError={setError} />
      </div>
    </div>
  );
}
