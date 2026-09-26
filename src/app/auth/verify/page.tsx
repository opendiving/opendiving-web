import type { Metadata } from "next";

import { VerifyMagicLinkPageContent } from "@/components/auth/verify-page-content";

export const metadata: Metadata = { title: "Sign In" };

export default function VerifyMagicLinkPage() {
  return <VerifyMagicLinkPageContent />;
}
