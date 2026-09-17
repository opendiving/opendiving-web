"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardList, Save } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { authAPI } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FormApiError } from "@/components/ui/form-api-error";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  checkInDetailsFromUser,
  checkInDetailsSchema,
  checkInDetailsUpdate,
  EMPTY_CHECK_IN_DETAILS,
  type CheckInDetailsInput,
} from "@/lib/validations/settings";

// What a dive shop asks for at the desk, entered once here and printed from
// `/checkin`. Three groups under one save button rather than three cards saving on
// change: an emergency contact is a name, a number and a relationship that only mean
// anything together, and a diver filling this in on arrival is filling in all of it.
//
// Empty fields are sent as explicit nulls (`checkInDetailsUpdate`), so clearing a
// group actually clears it rather than leaving the previous values on the row.
export function CheckInDetailsCard() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CheckInDetailsInput>({
    resolver: zodResolver(checkInDetailsSchema),
    defaultValues: EMPTY_CHECK_IN_DETAILS,
  });

  // Repaints from what came back, which is what makes `refreshUser()` below the end
  // of a save: the card shows the row rather than what was typed into it.
  //
  // Once per account object, not once per effect. `/settings` is kept mounted while
  // the diver is on another route, and a mounted route has its effects destroyed on
  // hide and re-created on show - so without the ref, coming back to a half-filled
  // card would repaint over what was typed. Every other card on this page keeps it.
  const { reset } = form;
  const paintedFor = useRef<typeof user>(null);
  useEffect(() => {
    if (!user || paintedFor.current === user) return;
    paintedFor.current = user;
    reset(checkInDetailsFromUser(user));
  }, [user, reset]);

  const onSubmit = async (data: CheckInDetailsInput) => {
    setError(null);
    try {
      await authAPI.updateProfile(checkInDetailsUpdate(data));
      await refreshUser();
      toast({
        title: "Saved",
        description: "Your check-in details are up to date.",
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to save. Please try again."));
    }
  };

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
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col flex-1"
          >
            <div className="space-y-6 flex-1">
              <fieldset className="space-y-4">
                <legend className="text-sm font-medium">About you</legend>
                <FormField
                  control={form.control}
                  name="date_of_birth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of birth</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone number</FormLabel>
                      <FormControl>
                        <Input type="tel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="text-sm font-medium">
                  Emergency contact
                </legend>
                <FormField
                  control={form.control}
                  name="emergency_contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emergency_contact_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Their phone number</FormLabel>
                      <FormControl>
                        <Input type="tel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emergency_contact_relationship"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship to you</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Partner, parent, friend…"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="text-sm font-medium">Dive insurance</legend>
                <FormField
                  control={form.control}
                  name="insurance_provider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provider</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="DAN Europe, DiveAssure…"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="insurance_policy_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Policy number</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="insurance_expires_on"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expires on</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </fieldset>
            </div>

            <FormApiError error={error} className="mt-4" />

            <Button
              type="submit"
              className="w-full mt-4"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <div className="flex items-center space-x-2">
                  <ButtonSpinner />
                  <span>Saving...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Save className="h-4 w-4" />
                  <span>Save changes</span>
                </div>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
