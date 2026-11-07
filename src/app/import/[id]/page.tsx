import type { Metadata } from "next";

import { ImportDetailPageContent } from "@/components/import/import-detail-page-content";

export const metadata: Metadata = { title: "Import" };

export default function ImportDetailPage() {
  return <ImportDetailPageContent />;
}
