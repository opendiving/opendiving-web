import type { Metadata } from "next";

import { SiteProposalsPageContent } from "@/components/sites/site-proposals-page-content";

export const metadata: Metadata = { title: "Your Proposals" };

export default function SiteProposalsPage() {
  return <SiteProposalsPageContent />;
}
