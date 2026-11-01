import type { Metadata } from "next";

import { ExportPageContent } from "@/components/export/export-page-content";

export const metadata: Metadata = { title: "Export" };

export default function ExportPage() {
  return <ExportPageContent />;
}
