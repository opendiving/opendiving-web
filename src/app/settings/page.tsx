"use client";

import { Loader2 } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarCard } from "@/components/settings/avatar-card";
import { DataExportCard } from "@/components/settings/data-export-card";
import { DeleteAccountCard } from "@/components/settings/delete-account-card";
import { EmailChangeCard } from "@/components/settings/email-change-card";
import { NotificationsCard } from "@/components/settings/notifications-card";
import { PasskeysCard } from "@/components/settings/passkeys-card";
import { UnitsCard } from "@/components/settings/units-card";
import { User, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api/error";
import { authAPI } from "@/lib/api/auth";
import {
  profileSchema,
  type ProfileFormData,
} from "@/lib/validations/settings";
import { ButtonSpinner } from "@/components/ui/button-spinner";

export default function SettingsPage() {
  const { isAuthenticated, isLoading } = useAuthGuard();
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors, isSubmitting: isProfileSubmitting },
    reset: resetProfile,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      username: "",
    },
  });

  // Set form defaults when user data loads
  useEffect(() => {
    if (user) {
      resetProfile({
        name: user.name || "",
        username: user.username || "",
      });
    }
  }, [user, resetProfile]);

  const onProfileSubmit = async (data: ProfileFormData) => {
    if (!user) return;

    try {
      await authAPI.updateProfile(data);
      await refreshUser();
      toast({
        title: "Saved",
        description: "Your profile has been updated.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: getApiErrorMessage(err, "Failed to update profile"),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Account Settings
        </h1>
        <p className="text-muted-foreground">
          Manage your account information.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Profile Information */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>
              Update your personal information and account details.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-1">
            <form
              onSubmit={handleProfileSubmit(onProfileSubmit)}
              className="flex flex-col flex-1"
            >
              <div className="space-y-4 flex-1">
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your full name"
                    {...registerProfile("name")}
                    className={profileErrors.name ? "border-destructive" : ""}
                  />
                  {profileErrors.name && (
                    <p className="text-sm text-destructive">
                      {profileErrors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="Choose a username"
                    {...registerProfile("username")}
                    className={
                      profileErrors.username ? "border-destructive" : ""
                    }
                  />
                  {profileErrors.username && (
                    <p className="text-sm text-destructive">
                      {profileErrors.username.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Lowercase letters and numbers, unique across OpenDiving.
                  </p>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full mt-4"
                disabled={isProfileSubmitting}
              >
                {isProfileSubmitting ? (
                  <div className="flex items-center space-x-2">
                    <ButtonSpinner />
                    <span>Saving...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Save className="h-4 w-4" />
                    <span>Save Changes</span>
                  </div>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <AvatarCard />

        <EmailChangeCard currentEmail={user.email} />

        <NotificationsCard />

        <UnitsCard />

        <PasskeysCard />
      </div>

      {/* Full width rather than another cell in the grid above: the three rows each
          carry a sentence of prose, and at half the page every one of them wraps to
          four lines. */}
      <div className="mt-8">
        <DataExportCard username={user.username} />
      </div>

      <div className="mt-8">
        <DeleteAccountCard username={user.username} />
      </div>
    </div>
  );
}
