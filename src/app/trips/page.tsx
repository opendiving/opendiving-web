import type { Metadata } from "next";

import { TripsPageContent } from "@/components/trips/trips-page-content";

export const metadata: Metadata = { title: "Trips" };

export default function TripsPage() {
  return <TripsPageContent />;
}
