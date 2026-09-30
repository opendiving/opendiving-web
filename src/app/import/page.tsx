import type { Metadata } from "next";

import { ImportPageContent } from "@/components/import/import-page-content";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return <ImportPageContent />;
}
