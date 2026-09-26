import { InviteQueue } from "@/components/admin/invite-queue";

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function AdminInvitesPage() {
  return <InviteQueue />;
}
