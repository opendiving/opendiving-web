import type { Metadata } from "next";

import { DivesPageContent } from "@/components/dives/dives-page-content";

export const metadata: Metadata = { title: "Dives" };

export default function DivesPage() {
  return <DivesPageContent />;
}
