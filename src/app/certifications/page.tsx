import type { Metadata } from "next";

import { CertificationsPageContent } from "@/components/certifications/certifications-page-content";

export const metadata: Metadata = { title: "Certifications" };

export default function CertificationsPage() {
  return <CertificationsPageContent />;
}
