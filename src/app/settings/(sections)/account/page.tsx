"use client";

import { useAuth } from "@/contexts/AuthContext";
import { DeleteAccountCard } from "@/components/settings/delete-account-card";
import { EmailChangeCard } from "@/components/settings/email-change-card";
import { ProfileCard } from "@/components/settings/profile-card";

export default function AccountSettingsPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <>
      <div className="grid gap-8 xl:grid-cols-2">
        <ProfileCard />
        <EmailChangeCard currentEmail={user.email} />
      </div>
      <DeleteAccountCard username={user.username} />
    </>
  );
}
