import type { Metadata } from "next";

import { CheckInPageContent } from "@/components/checkin/checkin-page-content";

export const metadata: Metadata = { title: "Diver Check-in" };

export default function CheckInPage() {
  return <CheckInPageContent />;
}
