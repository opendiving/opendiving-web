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
      setError(
        getApiErrorMessage(err, "Could not complete your profile."),
      );
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 items-center text-center">
        <UserAvatar
          email={onboarding.email}
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
          {error && (
            <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-md border border-red-200 dark:border-red-900">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={onboarding.email} disabled readOnly />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Enter your full name"
              {...register("name")}
              className={errors.name ? "border-red-500" : ""}
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="Choose a username"
              {...register("username")}
              className={errors.username ? "border-red-500" : ""}
            />
            {errors.username && (
              <p className="text-sm text-red-600">
                {errors.username.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
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
