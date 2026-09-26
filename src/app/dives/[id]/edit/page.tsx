import type { Metadata } from "next";

import { EditDivePageContent } from "@/components/dives/edit-dive-page-content";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Edit Dive", "Dives") },
};

export default function EditDivePage() {
  return <EditDivePageContent />;
}
