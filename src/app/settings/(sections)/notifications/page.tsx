import type { Metadata } from "next";

import { NotificationsCard } from "@/components/settings/notifications-card";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Notifications", "Settings") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function NotificationsSettingsPage() {
  return <NotificationsCard />;
}
