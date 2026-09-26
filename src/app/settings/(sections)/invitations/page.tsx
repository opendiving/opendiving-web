import { InvitationsSection } from "@/components/settings/invitations-section";

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function InvitationsSettingsPage() {
  return <InvitationsSection />;
}
