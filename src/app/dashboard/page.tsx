import type { Metadata } from "next";

import { DashboardPageContent } from "@/components/dashboard/dashboard-page-content";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <DashboardPageContent />;
}
