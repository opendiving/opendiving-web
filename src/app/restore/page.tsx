import type { Metadata } from "next";

import { RestorePageContent } from "@/components/auth/restore-page-content";

export const metadata: Metadata = { title: "Restore Account" };

export default function RestorePage() {
  return <RestorePageContent />;
}
