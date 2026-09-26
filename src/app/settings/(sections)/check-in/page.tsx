"use client";

import Link from "next/link";

import {
  AboutYouCard,
  DiveInsuranceCard,
  EmergencyContactCard,
} from "@/components/settings/check-in-details-cards";

export default function CheckInSettingsPage() {
  return (
    <>
      <p className="text-muted-foreground">
        What a dive shop asks for at the desk. Fill in what you want to hand
        over; anything you leave empty is left off your{" "}
        <Link href="/checkin" className="underline hover:text-foreground">
          check-in summary
        </Link>
        .
      </p>
      <AboutYouCard />
      <DiveInsuranceCard />
      <EmergencyContactCard />
    </>
  );
}
