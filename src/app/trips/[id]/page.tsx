import type { Metadata } from "next";

import { TripDetailPageContent } from "@/components/trips/trip-detail-page-content";

export const metadata: Metadata = { title: "Trips" };

export default function TripDetailPage() {
  return <TripDetailPageContent />;
}
