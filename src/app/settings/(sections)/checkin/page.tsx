import {
  AboutYouCard,
  CheckInDetailsCard,
  DiveInsuranceCard,
  EmergencyContactCard,
} from "@/components/settings/check-in-details-cards";

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
