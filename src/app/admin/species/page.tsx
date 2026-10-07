import type { Metadata } from "next";

import { SpeciesCatalog } from "@/components/admin/species-catalog";

export const metadata: Metadata = { title: "Species" };

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function AdminSpeciesPage() {
  return <SpeciesCatalog />;
}
