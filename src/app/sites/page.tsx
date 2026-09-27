import type { Metadata } from "next";

import { SitesPageContent } from "@/components/sites/sites-page-content";

export const metadata: Metadata = { title: "Dive Sites" };

export default function SitesPage() {
  return <SitesPageContent />;
}
