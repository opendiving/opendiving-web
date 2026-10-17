import type { Metadata } from "next";

import { SpeciesCatalog } from "@/components/admin/species-catalog";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Species", "Admin") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function AdminSpeciesPage() {
  return <SpeciesCatalog />;
}
