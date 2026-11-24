import type { Metadata } from "next";
import { Suspense } from "react";

import { SharedCheckInPage } from "@/components/checkin/shared-checkin-page";
import { PageSpinner } from "@/components/ui/page-spinner";

// A Server Component for the one thing a client page cannot carry: `robots` for this
// route alone. A link is somebody's details for a day, so it asks every instance's
// crawlers to stay out, where `WEB_NOINDEX` closes a whole site or nothing.
export const metadata: Metadata = {
  title: "Diver Check-in",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;

// The token is read under a boundary so every link shares one shell, whose fallback
// is the spinner the page draws first anyway.
export default function SharedCheckInRoute({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSpinner variant="inset" />}>
      <SharedCheckInToken params={params} />
    </Suspense>
  );
}

async function SharedCheckInToken({ params }: { params: Params }) {
  const { token } = await params;
  return <SharedCheckInPage token={token} />;
}
