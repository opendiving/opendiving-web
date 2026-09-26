import type { Metadata } from "next";

import { ContactsPageContent } from "@/components/contacts/contacts-page-content";

export const metadata: Metadata = { title: "Contacts" };

export default function ContactsPage() {
  return <ContactsPageContent />;
}
