"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
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
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/contexts/AuthContext";
import {
  profileCompletionSchema,
  ProfileCompletionFormData,
} from "@/lib/validations/auth";
import { getApiErrorMessage } from "@/lib/api/error";
import { UserPlus } from "lucide-react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { StatusMessage } from "@/components/ui/status-message";

// Shared by both authentication methods: shown once, for a verified identity (email
// or Google) with no existing account. Email is read-only (it's already been
// verified - that's *why* this form exists), name is prefilled when Google supplied
// one but always editable, and there's no password field.
export function ProfileCompletionForm() {
  const [error, setError] = useState<string | null>(null);
  const { onboarding, completeProfile } = useAuth();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileCompletionFormData>({
    resolver: zodResolver(profileCompletionSchema),
    defaultValues: {
      name: onboarding?.name ?? "",
      username: "",
    },
  });

  if (!onboarding) {
    return null;
  }

  const onSubmit = async (data: ProfileCompletionFormData) => {
    try {
      setError(null);
      await completeProfile(data.name, data.username);
      router.push("/dashboard");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not complete your profile."));
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 items-center text-center">
        {/* Initials, always: there is no account yet to fetch a picture from, and
            no upload step here on purpose - the profile picture is added with the
            profile in Settings. A Google sign-up arrives at the dashboard with their
            Google picture already imported by the API. */}
        <UserAvatar
          name={onboarding.name ?? onboarding.email}
          size={64}
          className="h-16 w-16 mb-2"
        />
        <CardTitle className="text-2xl font-bold">
          Complete your profile
        </CardTitle>
        <CardDescription>
          Just a couple more details and you&apos;re in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && <StatusMessage variant="error">{error}</StatusMessage>}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={onboarding.email}
              disabled
              readOnly
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Enter your full name"
              {...register("name")}
              className={errors.name ? "border-destructive" : ""}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="Choose a username"
              {...register("username")}
              className={errors.username ? "border-destructive" : ""}
            />
            {errors.username && (
              <p className="text-sm text-destructive">
                {errors.username.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <div className="flex items-center space-x-2">
                <ButtonSpinner />
                <span>Creating your account...</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <UserPlus size={16} />
                <span>Finish setting up</span>
              </div>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
