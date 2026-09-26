import type { Metadata } from "next";

import { SharedCheckInPage } from "@/components/checkin/shared-checkin-page";

// A Server Component for the one thing a client page cannot carry: `robots` for this
// route alone. A link is somebody's details for a day, so it asks every instance's
// crawlers to stay out, where `WEB_NOINDEX` closes a whole site or nothing.
export const metadata: Metadata = {
  title: "Diver Check-in",
  robots: { index: false, follow: false },
};

export default async function SharedCheckInRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedCheckInPage token={token} />;
}
