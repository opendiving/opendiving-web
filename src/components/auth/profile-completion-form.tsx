"use client";

import React, { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  profileCompletionSchema,
  ProfileCompletionFormData,
} from "@/lib/validations/auth";
import { getApiErrorMessage } from "@/lib/api/error";
import { UserPlus } from "lucide-react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { StatusMessage } from "@/components/ui/status-message";
import { useToast } from "@/components/ui/use-toast";
import { PictureField } from "@/components/user/picture-field";
import { usePictureEdit } from "@/hooks/usePictureEdit";
import { applyPictureEdit } from "@/lib/picture-edits";
import {
  StandaloneCard,
  StandaloneCardHeader,
} from "@/components/layout/standalone-card";

// Shared by both authentication methods: shown once, for a verified identity (email
// or Google) with no existing account. Email is read-only (it's already been
// verified - that's *why* this form exists), name is prefilled when Google supplied
// one but always editable, and there's no password field.
//
// The profile picture is optional and held until the account exists: there is none
// to upload it to before, so it goes in `completeProfile`'s `onCreated`.
export function ProfileCompletionForm() {
  const [error, setError] = useState<string | null>(null);
  const { onboarding, completeProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [pictureEdit, setPictureEdit] = usePictureEdit();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProfileCompletionFormData>({
    resolver: zodResolver(profileCompletionSchema),
    defaultValues: {
      name: onboarding?.name ?? "",
      username: "",
    },
  });

  // Whose initials the empty picture shows, following the name as it is typed.
  const name = useWatch({ control, name: "name" });

  if (!onboarding) {
    return null;
  }

  const onSubmit = async (data: ProfileCompletionFormData) => {
    // A picture that fails leaves the account made and signed in, so it is said
    // after the move on rather than in place of it.
    const pictureFailure: { error?: unknown } = {};
    const savePicture = async () => {
      if (!pictureEdit) return;
      try {
        await applyPictureEdit("avatar", pictureEdit);
      } catch (error) {
        console.error("Failed to save the profile picture:", error);
        pictureFailure.error = error;
      }
    };

    try {
      setError(null);
      await completeProfile(data.name, data.username, savePicture);
      if ("error" in pictureFailure) {
        toast({
          title: "Your account is ready, but your profile picture did not save",
          description: getApiErrorMessage(
            pictureFailure.error,
            "Add it again in Settings.",
          ),
          variant: "destructive",
        });
      }
      router.push("/home");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not complete your profile."));
    }
  };

  return (
    <StandaloneCard>
      <StandaloneCardHeader
        icon={UserPlus}
        title="Complete Your Profile"
        description="Just a couple more details and you're in."
      />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <StatusMessage variant="error">{error}</StatusMessage>}

        <PictureField
          picture="avatar"
          name={name || onboarding.email}
          edit={pictureEdit}
          onChange={setPictureEdit}
          disabled={isSubmitting}
        />

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

        <Button
          type="submit"
          className="w-full bg-coral text-primary-foreground hover:bg-coral/90"
          disabled={isSubmitting}
        >
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
    </StandaloneCard>
  );
}
