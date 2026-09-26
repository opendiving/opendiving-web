import type { Metadata } from "next";

import { SpeciesDetailPageContent } from "@/components/species/species-detail-page-content";

export const metadata: Metadata = { title: "Species" };

export default function SpeciesDetailPage() {
  return <SpeciesDetailPageContent />;
}
