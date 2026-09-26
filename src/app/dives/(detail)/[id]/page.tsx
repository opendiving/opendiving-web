import { DiveDetailCards } from "@/components/dives/dive-detail-cards";

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function DiveDetailPage() {
  return <DiveDetailCards />;
}
