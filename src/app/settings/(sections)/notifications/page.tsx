import { NotificationsCard } from "@/components/settings/notifications-card";

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function NotificationsSettingsPage() {
  return <NotificationsCard />;
}
