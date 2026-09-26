import type { Metadata } from "next";

import { DataPageContent } from "@/components/data/data-page-content";

export const metadata: Metadata = { title: "Import and Export" };

export default function DataPage() {
  return <DataPageContent />;
}
