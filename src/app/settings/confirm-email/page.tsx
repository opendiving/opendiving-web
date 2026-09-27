import type { Metadata } from "next";

import { ConfirmEmailChangePageContent } from "@/components/settings/confirm-email-page-content";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Confirm Email Change", "Settings") },
};

export default function ConfirmEmailChangePage() {
  return <ConfirmEmailChangePageContent />;
}
