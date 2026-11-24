import type { Metadata } from "next";
import { Suspense } from "react";

import { ConnectPage } from "@/components/people/connect-page";
import { PageSpinner } from "@/components/ui/page-spinner";

// A Server Component for the one thing a client page cannot carry: `robots` for this
// route alone. A link is one diver's, made to be handed to one person, so it asks
// every instance's crawlers to stay out and names no canonical of its own, as the
// check-in link's page does. The page answers 200 whatever the token: what it names
// is asked of the API in the browser.
export const metadata: Metadata = {
  title: "Connect",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;

// The token is read under a boundary so every link shares one shell, whose fallback
// is the spinner the page draws first anyway.
export default function ConnectRoute({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSpinner className="bg-background" />}>
      <ConnectToken params={params} />
    </Suspense>
  );
}

async function ConnectToken({ params }: { params: Params }) {
  const { token } = await params;
  return <ConnectPage token={token} />;
}
