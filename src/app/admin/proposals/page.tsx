import type { Metadata } from "next";

import { ProposalQueue } from "@/components/admin/proposal-queue";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Commons Proposals", "Admin") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function AdminProposalsPage() {
  return <ProposalQueue />;
}
