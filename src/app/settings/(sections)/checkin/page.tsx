import type { Metadata } from "next";

import {
  AboutYouCard,
  CheckInDetailsCard,
  DiveInsuranceCard,
  EmergencyContactCard,
} from "@/components/settings/check-in-details-cards";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Check-in", "Settings") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function CheckInSettingsPage() {
  return (
    <>
      <CheckInDetailsCard />
      <AboutYouCard />
      <DiveInsuranceCard />
      <EmergencyContactCard />
    </>
  );
}
