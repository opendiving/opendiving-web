import type { Metadata } from "next";

import { StorageCard } from "@/components/settings/storage-card";
import { DataPageExportCard } from "@/components/settings/data-page-export-card";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Data", "Settings") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function DataSettingsPage() {
  return (
    <>
      <StorageCard />
      <DataPageExportCard />
    </>
  );
}
