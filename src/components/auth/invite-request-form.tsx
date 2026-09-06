"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusMessage } from "@/components/ui/status-message";
import { getApiErrorMessage } from "@/lib/api/error";
import { invitationsAPI } from "@/lib/api/invitations";
import {
  emailAuthSchema,
  type EmailAuthFormData,
} from "@/lib/validations/auth";
import { cn } from "@/lib/utils";

// Which voice the form speaks in. `generic` is the only one that is true of every
// instance and so the default; `waitlist` is the project speaking as the operator
// of a copy it runs itself, and only `GET /config` saying so can pick it.
export type InviteRequestVariant = "generic" | "waitlist";

interface InviteRequestFormProps {
  variant?: InviteRequestVariant;
  className?: string;
}

interface InviteRequestCopy {
  heading: string;
  blurb: string;
  button: string;
  successHeading: string;
  // Takes the rendered address rather than the string, so both voices set it in
  // the same weight and neither can forget to.
  successBody: (address: ReactNode) => ReactNode;
}

// The four strings and the success state move together: a heading that says
// "Get early access" over a body that says "whoever runs this instance decides"
// is two operators speaking at once. That is why this is a table of whole
// variants and not four independently configurable strings - see "The request
// form speaks in two voices" in DECISIONS.md.
const COPY: Record<InviteRequestVariant, InviteRequestCopy> = {
  generic: {
    heading: "Request an invite",
    blurb:
      "This instance is not taking new accounts on its own. Leave your address and whoever runs it can invite you.",
    button: "Request an invite",
    successHeading: "Request received",
    successBody: (address) => (
      <>
        If an invitation comes your way it will arrive at {address}. Whoever
        runs this instance decides who is invited, and when.
      </>
    ),
  },
  waitlist: {
    heading: "Get early access",
    blurb:
      "Join the waitlist for a chance to be among the first to try OpenDiving. We'll notify you when your spot is ready. Just that, no spam.",
    button: "Join the waitlist",
    successHeading: "You're on the list",
    successBody: (address) => (
      <>We'll email {address} when your spot is ready.</>
    ),
  },
};

/**
 * The hero's form on an instance that is not taking registrations: an address,
 * and a request for whoever runs the instance to invite it.
 *
 * It speaks in one of two voices, and `variant` says which. The landing page
 * decides that from `GET /config` and passes it down; the form deliberately does
 * not read the hook itself, so the page stays the one place the decision is made
 * and either voice renders in a test without an API.
 *
 * **`generic` is the default because every sentence of it has to be true of a
 * household instance as well as a hosted one.** The same copy renders for
 * somebody sharing a copy of OpenDiving with three dive buddies, so there is no
 * "beta", no "we", and no promise that an invitation is coming - the operator
 * decides who is invited and when, and this form can only say so. Any instance
 * whose `/config` did not say otherwise gets this voice, which is what makes it
 * safe as the default rather than merely conventional.
 *
 * **`waitlist` is the project speaking as the operator of its own copy**, the
 * role the privacy page already allows for: "where the project does run a copy,
 * it is that copy's operator as well, and every commitment this page makes of
 * the operator is one it makes in that role". It is chosen only where the API
 * answered `project_operated: true`. The copy makes two promises. "We'll notify
 * you" is backed by the API, which emails an invitation to an address the moment
 * it is invited, so the notification is the invitation itself; "no spam" is the
 * operator's promise, and nothing in the app enforces it.
 *
 * The API answers 202 for every address it is given - a first request, a repeat,
 * an address that already has an account, an address invited last week - and
 * never queries the user table on the way. This form must not try to be more
 * informative than that: one success state per voice, whatever was stored.
 *
 * There is no passkey ceremony and no Google button here, unlike `AuthForm`. Both
 * are ways of *signing in*, and this is not the sign-in surface; a returning
 * member takes the link below to `/signin`, where all of it still is.
 */
export function InviteRequestForm({
  variant = "generic",
  className,
}: InviteRequestFormProps) {
  const copy = COPY[variant];
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailAuthFormData>({
    // The sign-in form's schema, not one of its own: the two fields ask for the
    // same thing and a second definition is a second place for the message to
    // differ.
    resolver: zodResolver(emailAuthSchema),
  });

  const onSubmit = async (data: EmailAuthFormData) => {
    try {
      setError(null);
      await invitationsAPI.requestInvite(data.email);
      setRequested(data.email);
    } catch (err) {
      setError(
        getApiErrorMessage(err, "Something went wrong. Please try again."),
      );
    }
  };

  return (
    <div
      className={cn(
        "w-full max-w-md rounded-lg border bg-card p-6 shadow-sm",
        className,
      )}
    >
      {requested ? (
        // Replaces the form outright, the way `CheckEmailCard` replaces the
        // sign-in form: a filled-in field left on screen under a success message
        // invites a second submission that would tell the diver nothing new.
        <div className="text-center">
          <MailCheck className="mx-auto mb-3 h-10 w-10 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            {copy.successHeading}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy.successBody(
              <span className="font-medium text-foreground">{requested}</span>,
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 text-left">
            <h2 className="text-lg font-semibold text-foreground">
              {copy.heading}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{copy.blurb}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && <StatusMessage variant="error">{error}</StatusMessage>}

            <div className="space-y-2 text-left">
              <Label htmlFor="invite-request-email">Email</Label>
              <Input
                id="invite-request-email"
                type="email"
                placeholder="you@example.com"
                // Plain `email`, not the sign-in field's `username webauthn`:
                // nothing here arms a passkey ceremony, and offering a passkey in
                // the dropdown of a field that cannot sign anyone in would be an
                // odd thing to do.
                autoComplete="email"
                {...register("email")}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && (
                <p className="text-sm text-destructive">
                  {errors.email.message}
                </p>
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
                  <span>{copy.button}</span>
                  <ArrowRight size={16} />
                </div>
              )}
            </Button>
          </form>
        </>
      )}

      {/* Common to both voices: who may sign in does not depend on who runs the
          instance. Two audiences are named, a member and an invitee. The line used
          to name a third, the operator "setting this instance up", and does not:
          that reader exists for one moment, before the first account is created,
          and the install docs send them to Sign In for it. */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Have an account or an invitation?{" "}
        <Link href="/signin" className="underline underline-offset-4">
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}
