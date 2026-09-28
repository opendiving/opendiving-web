import type { Metadata } from "next";

import { metadata as landingMetadata } from "@/app/page";
import { JoinPage } from "@/components/layout/join-page";

// The landing page with one form swapped, so it carries the landing page's own title
// and description, and names `/` as its canonical: a crawler that follows a join link
// posted on a forum credits the home page with it rather than indexing a second copy
// of it per link. Not `noindex` - that would throw the link's weight away rather than
// hand it on - and not disallowed in `robots.txt` either, since a page that is never
// fetched never shows a crawler its canonical. `metadataBase` in the root layout
// resolves the path against `SITE_URL`.
export const metadata: Metadata = {
  ...landingMetadata,
  alternates: { canonical: "/" },
};

export default function JoinRoute() {
  return <JoinPage />;
}
