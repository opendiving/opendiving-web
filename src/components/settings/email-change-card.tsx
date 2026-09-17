"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authAPI } from "@/lib/api/auth";
import {
  emailChangeSchema,
  EmailChangeFormData,
} from "@/lib/validations/settings";
import { getApiErrorMessage } from "@/lib/api/error";
import { Mail, MailCheck, Send } from "lucide-react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { StatusMessage } from "@/components/ui/status-message";

interface EmailChangeCardProps {
  currentEmail: string;
}

// Email can't be edited as a plain field, which is why `USER_FIELDS` in
// `lib/validations/user-fields.ts` leaves it out: changing it requires confirming
// ownership of the new address via a magic link first
// (`authAPI.requestEmailChange`/`verifyEmailChange`), so this is its own small
// request/confirm form rather than a box on the profile form.
// Always operates on the signed-in caller's own account - no uuid prop needed.
export function EmailChangeCard({ currentEmail }: EmailChangeCardProps) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmailChangeFormData>({
    resolver: zodResolver(emailChangeSchema),
  });

  const onSubmit = async (data: EmailChangeFormData) => {
    try {
      setError(null);
      await authAPI.requestEmailChange(data.newEmail);
      setSentTo(data.newEmail);
      reset();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not start the email change."));
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Address
        </CardTitle>
        <CardDescription>
          Changing your email requires confirming the new address first.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col flex-1">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col flex-1"
        >
          <div className="space-y-4 flex-1">
            <div className="space-y-2">
              <Label htmlFor="currentEmail">Current email</Label>
              <Input
                id="currentEmail"
                type="email"
                value={currentEmail}
                disabled
                readOnly
              />
            </div>

            {sentTo && (
              <StatusMessage variant="success">
                <span>
                  We sent a confirmation link to <strong>{sentTo}</strong>.
                  Click it to finish changing your email - it expires in 30
                  minutes.
                </span>
              </StatusMessage>
            )}

            {error && <StatusMessage variant="error">{error}</StatusMessage>}

            <div className="space-y-2">
              <Label htmlFor="newEmail">New email address</Label>
              <Input
                id="newEmail"
                type="email"
                placeholder="you@example.com"
                {...register("newEmail")}
                className={errors.newEmail ? "border-destructive" : ""}
              />
              {errors.newEmail && (
                <p className="text-sm text-destructive">
                  {errors.newEmail.message}
                </p>
              )}
            </div>
          </div>

          <div className="pt-4">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <div className="flex items-center space-x-2">
                  <ButtonSpinner />
                  <span>Sending...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Send className="h-4 w-4" />
                  <span>Send confirmation link</span>
                </div>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
