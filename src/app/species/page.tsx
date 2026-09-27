import type { Metadata } from "next";

import { SpeciesPageContent } from "@/components/species/species-page-content";

export const metadata: Metadata = { title: "Species" };

export default function SpeciesPage() {
  return <SpeciesPageContent />;
}
