"use client";

import Link from "next/link";
import {
  ClipboardList,
  IdCard,
  PhoneCall,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import type { CheckinGroup } from "@/lib/validations/checkin-details";
import { Button } from "@/components/ui/button";
import {
  CARD_TITLE_ACTION,
  CARD_TITLE_ROW,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CHECK_IN_GROUP_HEADINGS,
  CheckinDetailsForm,
} from "@/components/checkin/checkin-details-form";
import { UserFieldsSubmitButton } from "@/components/user/user-fields-form";
import type { PictureKind } from "@/lib/picture";

interface CheckInGroupCardProps {
  icon: LucideIcon;
  group: CheckinGroup;
  picture?: PictureKind;
  savedMessage: string;
}

// The settings home for the check-in details: one card and one save per group, the
// groups `/checkin` opens one at a time in dialogs beside the sections that print
// them - `CheckinDetailsForm` is both, and `CHECK_IN_GROUP_HEADINGS` heads both. Each
// card sends its own group and no other key, so a save here never touches another
// card's members, and every card shows the one shared copy the save replaced.
function CheckInGroupCard({
  icon: Icon,
  group,
  picture,
  savedMessage,
}: CheckInGroupCardProps) {
  const { title, description } = CHECK_IN_GROUP_HEADINGS[group];
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <CheckinDetailsForm
          group={group}
          picture={picture}
          savedMessage={savedMessage}
        >
          <UserFieldsSubmitButton className="w-full mt-4" />
        </CheckinDetailsForm>
      </CardContent>
    </Card>
  );
}

// Heads the section: what the three cards below are for, and the way to the page that
// shows them to a dive shop. The button sits beside the heading rather than inside it,
// so the heading's name stays the title alone.
export function CheckInDetailsCard() {
  return (
    <Card>
      <CardHeader>
        <div className={CARD_TITLE_ROW}>
          <CardTitle as="h2" className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Check-in Details
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className={CARD_TITLE_ACTION}
            asChild
          >
            <Link href="/checkin">Check-in</Link>
          </Button>
        </div>
        <CardDescription>
          What a dive shop asks for at the desk. Fill in what you want to hand
          over; anything you leave empty is left off your check-in summary.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export function AboutYouCard() {
  return (
    <CheckInGroupCard
      icon={IdCard}
      group="about"
      picture="portrait"
      savedMessage="Your details are up to date."
    />
  );
}

export function DiveInsuranceCard() {
  return (
    <CheckInGroupCard
      icon={ShieldCheck}
      group="insurance"
      savedMessage="Your insurance policies are up to date."
    />
  );
}

export function EmergencyContactsCard() {
  return (
    <CheckInGroupCard
      icon={PhoneCall}
      group="emergency"
      savedMessage="Your emergency contacts are up to date."
    />
  );
}
