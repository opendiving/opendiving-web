import type { Metadata } from "next";

import { AdminStatsScreen } from "@/components/admin/admin-stats";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Stats", "Admin") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function AdminStatsPage() {
  return <AdminStatsScreen />;
}
