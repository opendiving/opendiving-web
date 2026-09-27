import type { Metadata } from "next";

import { PeoplePageContent } from "@/components/people/people-page-content";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage() {
  return <PeoplePageContent />;
}
