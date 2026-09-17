"use client";

import { ClipboardList } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CheckInDetailsForm,
  CheckInDetailsSubmitButton,
} from "@/components/checkin/check-in-details-form";

// The settings home for the check-in details. The fields and the save are
// `CheckInDetailsForm`'s, shared with the dialog `/checkin` opens over the summary -
// a diver correcting a phone number at a dive-shop desk is filling in this same card
// from the page that prints it.
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
        <CheckInDetailsForm>
          <CheckInDetailsSubmitButton className="w-full mt-4" />
        </CheckInDetailsForm>
      </CardContent>
    </Card>
  );
}
