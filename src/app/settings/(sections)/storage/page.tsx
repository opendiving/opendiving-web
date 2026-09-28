import type { Metadata } from "next";

import { StorageCard } from "@/components/settings/storage-card";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Storage", "Settings") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function StorageSettingsPage() {
  return <StorageCard />;
}
