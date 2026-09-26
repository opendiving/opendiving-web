import type { Metadata } from "next";

import { NewDivePageContent } from "@/components/dives/new-dive-page-content";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Log New Dive", "Dives") },
};

export default function NewDivePage() {
  return <NewDivePageContent />;
}
