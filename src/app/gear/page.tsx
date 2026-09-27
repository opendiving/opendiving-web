import type { Metadata } from "next";

import { GearPageContent } from "@/components/gear/gear-page-content";

export const metadata: Metadata = { title: "Gear" };

export default function GearPage() {
  return <GearPageContent />;
}
