"use client";

import { PasskeysCard } from "@/components/settings/passkeys-card";
import { SessionsCard } from "@/components/settings/sessions-card";

export default function AuthenticationSettingsPage() {
  return (
    <>
      <PasskeysCard />
      <SessionsCard />
    </>
  );
}
