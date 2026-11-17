import type { Metadata } from "next";

import { ExternalRequestsScreen } from "@/components/admin/external-requests-screen";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("External Requests", "Admin") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function AdminExternalRequestsPage() {
  return <ExternalRequestsScreen />;
}
