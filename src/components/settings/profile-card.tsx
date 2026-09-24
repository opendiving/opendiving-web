"use client";

import { User } from "lucide-react";

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

// Name, username and the profile picture, on the same form module as the check-in
// details beside it and as the dialogs `/checkin` opens - so the bounds, the messages
// and the "" -> null rule are the ones in `validations/user-fields.ts` and not a second
// copy of them, and the picture saves with the fields rather than on a Save of its own.
//
// Email is not here: changing it needs ownership of the new address confirmed first,
// which is `EmailChangeCard`'s own flow.
export function ProfileCard() {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile Information
        </CardTitle>
        <CardDescription>
          Update your personal information and account details.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col flex-1">
        <UserFieldsForm
          groups={[{ fields: ["name", "username"] }]}
          picture="avatar"
          savedMessage="Your profile has been updated."
        >
          <UserFieldsSubmitButton className="w-full mt-4" />
        </UserFieldsForm>
      </CardContent>
    </Card>
  );
}
