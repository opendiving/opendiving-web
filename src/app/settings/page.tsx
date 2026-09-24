"use client";

import { Loader2 } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { CheckInDetailsCard } from "@/components/settings/check-in-details-card";
import { DataExportCard } from "@/components/settings/data-export-card";
import { DataImportCard } from "@/components/settings/data-import-card";
import { DeleteAccountCard } from "@/components/settings/delete-account-card";
import { DeviceMemoryCard } from "@/components/settings/device-memory-card";
import { EmailChangeCard } from "@/components/settings/email-change-card";
import { InvitationsCard } from "@/components/settings/invitations-card";
import { NotificationsCard } from "@/components/settings/notifications-card";
import { PasskeysCard } from "@/components/settings/passkeys-card";
import { ProfileCard } from "@/components/settings/profile-card";
import { SessionsCard } from "@/components/settings/sessions-card";
import { UnitsCard } from "@/components/settings/units-card";

export default function SettingsPage() {
  const { isAuthenticated, isLoading } = useAuthGuard();
  const { user } = useAuth();

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
        <ProfileCard />

        <EmailChangeCard currentEmail={user.email} />

        <CheckInDetailsCard />

        <NotificationsCard />

        <UnitsCard />

        <PasskeysCard />

        <SessionsCard />

        {/* Removes itself on an instance that lets anyone register, the same way
            the two cards above it do on an instance whose API is older than the
            feature they belong to. Nothing here knows the registration mode; the
            404 the list route answers with is what carries it. */}
        <InvitationsCard />

        <DeviceMemoryCard />
      </div>

      {/* Full width rather than another cell in the grid above: the four rows each
          carry a sentence of prose, and at half the page every one of them wraps to
          four lines. */}
      <div className="mt-8">
        <DataExportCard username={user.username} />
      </div>

      {/* Directly under the export card and full width for the same reason: it is
          the other half of the same promise, and its report table needs the room
          the two-column grid above would not give it. */}
      <div className="mt-8">
        <DataImportCard />
      </div>

      <div className="mt-8">
        <DeleteAccountCard username={user.username} />
      </div>
    </div>
  );
}
