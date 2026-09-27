import type { Metadata } from "next";

import { PasskeysCard } from "@/components/settings/passkeys-card";
import { SessionsCard } from "@/components/settings/sessions-card";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Authentication", "Settings") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function AuthenticationSettingsPage() {
  return (
    <>
      <PasskeysCard />
      <SessionsCard />
    </>
  );
}
