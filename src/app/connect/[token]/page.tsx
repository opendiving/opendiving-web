import type { Metadata } from "next";

import { ConnectPage } from "@/components/people/connect-page";

// A Server Component for the one thing a client page cannot carry: `robots` for this
// route alone. A link is one diver's, made to be handed to one person, so it asks
// every instance's crawlers to stay out and names no canonical of its own, as the
// check-in link's page does. The page answers 200 whatever the token: what it names
// is asked of the API in the browser.
export const metadata: Metadata = {
  title: "Connect",
  robots: { index: false, follow: false },
};

export default async function ConnectRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ConnectPage token={token} />;
}
