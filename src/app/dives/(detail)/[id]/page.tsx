import type { Metadata } from "next";

import { DiveDetailCards } from "@/components/dives/dive-detail-cards";

export const metadata: Metadata = { title: "Dives" };

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function DiveDetailPage() {
  return <DiveDetailCards />;
}
