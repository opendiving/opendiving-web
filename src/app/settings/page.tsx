"use client";

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
import { EmailChangeCard } from "@/components/settings/EmailChangeCard";
import { User, Save, AlertCircle, CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getApiErrorMessage } from "@/lib/api/error";
import { authAPI } from "@/lib/api/auth";
import { profileSchema, type ProfileFormData } from "@/lib/validations/settings";

export default function SettingsPage() {
  const { isAuthenticated, isLoading } = useAuthGuard();
  const { user, refreshUser } = useAuth();
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

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
      setProfileError(null);
      setProfileSuccess(null);

      await authAPI.updateProfile(data);
      await refreshUser();
      setProfileSuccess("Profile updated successfully!");
    } catch (err) {
      setProfileError(getApiErrorMessage(err, "Failed to update profile"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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
            <CardTitle className="flex items-center">
              <User className="h-5 w-5 mr-2 text-primary" />
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
                {profileSuccess && (
                  <div className="flex items-center p-3 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40 rounded-md border border-green-200 dark:border-green-900">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {profileSuccess}
                  </div>
                )}

                {profileError && (
                  <div className="flex items-center p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-md border border-red-200 dark:border-red-900">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    {profileError}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your full name"
                    {...registerProfile("name")}
                    className={profileErrors.name ? "border-red-500" : ""}
                  />
                  {profileErrors.name && (
                    <p className="text-sm text-red-600">
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
                    className={profileErrors.username ? "border-red-500" : ""}
                  />
                  {profileErrors.username && (
                    <p className="text-sm text-red-600">
                      {profileErrors.username.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Your username is used in your profile URL and for
                    mentions.
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
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
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

        <EmailChangeCard currentEmail={user.email} />
      </div>

      {/* Account Actions */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions for your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md p-4">
                <h4 className="font-medium text-red-800 dark:text-red-300 mb-2">
                  Delete Account
                </h4>
                <p className="text-sm text-red-700 dark:text-red-400 mb-3">
                  Once you delete your account, there is no going back. This
                  will permanently delete your profile, dive logs, and remove
                  all associations with projects and teams.
                </p>
                <Button variant="destructive" size="sm">
                  Delete My Account
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
