"use client";

import { ClipboardList } from "lucide-react";

import {
  ABOUT_YOU_FIELDS,
  EMERGENCY_CONTACT_FIELDS,
  INSURANCE_FIELDS,
} from "@/lib/validations/user-fields";
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

// The settings home for the check-in details: the portrait and three groups under one
// save, because a diver filling this in is filling in all of it. `/checkin` opens the
// same groups one at a time beside the sections that print them, the portrait with
// About you, which is where a diver already at a desk corrects one of them -
// `UserFieldsForm` is both.
export function CheckInDetailsCard() {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Check-in details
        </CardTitle>
        <CardDescription>
          What a dive shop asks for at the desk. Fill in what you want to hand
          over; anything you leave empty is left off your summary.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col flex-1">
        <UserFieldsForm
          groups={[
            { legend: "About you", fields: [...ABOUT_YOU_FIELDS] },
            { legend: "Dive insurance", fields: [...INSURANCE_FIELDS] },
            {
              legend: "Emergency contact",
              fields: [...EMERGENCY_CONTACT_FIELDS],
            },
          ]}
          picture="portrait"
          savedMessage="Your check-in details are up to date."
        >
          <UserFieldsSubmitButton className="w-full mt-4" />
        </UserFieldsForm>
      </CardContent>
    </Card>
  );
}
