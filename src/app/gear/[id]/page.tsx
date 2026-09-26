import type { Metadata } from "next";

import { GearItemDetailPageContent } from "@/components/gear/gear-item-detail-page-content";

export const metadata: Metadata = { title: "Gear" };

export default function GearItemDetailPage() {
  return <GearItemDetailPageContent />;
}
