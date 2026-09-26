import type { Metadata } from "next";

import { AccountSection } from "@/components/settings/account-section";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Account", "Settings") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function AccountSettingsPage() {
  return <AccountSection />;
}
