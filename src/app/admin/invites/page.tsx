import type { Metadata } from "next";

import { InviteQueue } from "@/components/admin/invite-queue";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Invite Queue", "Admin") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function AdminInvitesPage() {
  return <InviteQueue />;
}
