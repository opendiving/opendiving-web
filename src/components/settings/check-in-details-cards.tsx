"use client";

import Link from "next/link";
import {
  ClipboardList,
  IdCard,
  PhoneCall,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import {
  ABOUT_YOU_FIELDS,
  EMERGENCY_CONTACT_FIELDS,
  INSURANCE_FIELDS,
  type UserFieldKey,
} from "@/lib/validations/user-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  UserFieldsForm,
  UserFieldsSubmitButton,
} from "@/components/user/user-fields-form";
import type { PictureKind } from "@/lib/picture";

interface CheckInFieldsCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  fields: readonly UserFieldKey[];
  picture?: PictureKind;
  savedMessage: string;
}

// The settings home for the check-in details: one card and one save per group, the
// groups `/checkin` opens one at a time in dialogs beside the sections that print
// them - `UserFieldsForm` is both, and the titles and descriptions match its dialogs.
// Each group's cross-field rules stay inside the group, so saving one never trips
// over another left half-filled.
function CheckInFieldsCard({
  icon: Icon,
  title,
  description,
  fields,
  picture,
  savedMessage,
}: CheckInFieldsCardProps) {
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
        <UserFieldsForm
          groups={[{ fields: [...fields] }]}
          picture={picture}
          savedMessage={savedMessage}
        >
          <UserFieldsSubmitButton className="w-full mt-4" />
        </UserFieldsForm>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle as="h2" className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Check-in details
          </CardTitle>
          <Button variant="outline" size="sm" asChild>
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
    <CheckInFieldsCard
      icon={IdCard}
      title="About you"
      description="Your own details, as a desk asks for them."
      fields={ABOUT_YOU_FIELDS}
      picture="portrait"
      savedMessage="Your details are up to date."
    />
  );
}

export function DiveInsuranceCard() {
  return (
    <CheckInFieldsCard
      icon={ShieldCheck}
      title="Dive insurance"
      description="The provider and policy number a shop takes down, and when the cover runs out."
      fields={INSURANCE_FIELDS}
      savedMessage="Your dive insurance is up to date."
    />
  );
}

export function EmergencyContactCard() {
  return (
    <CheckInFieldsCard
      icon={PhoneCall}
      title="Emergency contact"
      description="Who a shop calls if something goes wrong, and how they know you."
      fields={EMERGENCY_CONTACT_FIELDS}
      savedMessage="Your emergency contact is up to date."
    />
  );
}
