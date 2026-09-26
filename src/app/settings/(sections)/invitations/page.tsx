import type { Metadata } from "next";

import { InvitationsSection } from "@/components/settings/invitations-section";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Invitations", "Settings") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function InvitationsSettingsPage() {
  return <InvitationsSection />;
}
