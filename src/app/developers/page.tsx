import type { Metadata } from "next";

import { ApiReferenceClient } from "@/components/developers/api-reference-client";

export const metadata: Metadata = {
  title: "API Reference",
  description:
    "Every route this copy of OpenDiving's API offers, with a client to try them against your own account.",
};

// Public, like the API's own OpenAPI document it renders: nothing here needs a
// session, and a request sent from it carries only the token pasted into it.
export default function DevelopersPage() {
  return (
    <div className="max-w-6xl mx-auto px-2.5 sm:px-6 lg:px-8">
      <ApiReferenceClient />
    </div>
  );
}
