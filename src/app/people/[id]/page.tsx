import type { Metadata } from "next";

import { PersonDetailPageContent } from "@/components/people/person-detail-page-content";

export const metadata: Metadata = { title: "People" };

export default function PersonDetailPage() {
  return <PersonDetailPageContent />;
}
