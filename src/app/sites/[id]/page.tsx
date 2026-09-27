import type { Metadata } from "next";

import { DiveSiteDetailPageContent } from "@/components/sites/dive-site-detail-page-content";

export const metadata: Metadata = { title: "Dive Sites" };

export default function DiveSiteDetailPage() {
  return <DiveSiteDetailPageContent />;
}
