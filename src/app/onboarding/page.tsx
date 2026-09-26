import type { Metadata } from "next";

import { OnboardingPageContent } from "@/components/auth/onboarding-page-content";

export const metadata: Metadata = { title: "Complete Your Profile" };

export default function OnboardingPage() {
  return <OnboardingPageContent />;
}
