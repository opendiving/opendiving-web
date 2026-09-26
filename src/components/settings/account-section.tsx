"use client";

import { useAuth } from "@/contexts/AuthContext";
import { DeleteAccountCard } from "@/components/settings/delete-account-card";
import { EmailChangeCard } from "@/components/settings/email-change-card";
import { ProfileCard } from "@/components/settings/profile-card";

export function AccountSection() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <>
      <ProfileCard />
      <EmailChangeCard currentEmail={user.email} />
      <DeleteAccountCard username={user.username} />
    </>
  );
}
