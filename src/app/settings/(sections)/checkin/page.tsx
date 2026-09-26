"use client";

import {
  AboutYouCard,
  CheckInDetailsCard,
  DiveInsuranceCard,
  EmergencyContactCard,
} from "@/components/settings/check-in-details-cards";

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
