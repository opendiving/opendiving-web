import { PasskeysCard } from "@/components/settings/passkeys-card";
import { SessionsCard } from "@/components/settings/sessions-card";

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
