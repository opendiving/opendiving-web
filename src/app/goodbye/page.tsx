import type { Metadata } from "next";

import { GoodbyePageContent } from "@/components/auth/goodbye-page-content";

export const metadata: Metadata = { title: "Account Deleted" };

export default function GoodbyePage() {
  return <GoodbyePageContent />;
}
