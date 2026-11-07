import type { Metadata } from "next";

import { ImportLogPageContent } from "@/components/import/import-log-page-content";

export const metadata: Metadata = { title: "Import log" };

export default function ImportLogPage() {
  return <ImportLogPageContent />;
}
