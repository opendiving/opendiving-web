"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useForm, useFormState } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { authAPI } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/error";
import { dialogFormSubmit } from "@/lib/dialog-form";
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

export interface CheckInDetailsFormProps {
  /**
   * The footer this host puts under the fields - `/settings` a full-width button,
   * `/checkin`'s dialog a Cancel/Save row. It renders inside the `<form>` and inside
   * the form provider, so `CheckInDetailsSubmitButton` below works wherever it is put.
   */
  children: ReactNode;
  /** Ran once the account has been re-read, which is what closes the dialog. */
  onSaved?: () => void;
}

/**
 * What a dive shop asks for at the desk, entered once and printed from `/checkin`.
 *
 * Three groups under one save rather than three cards saving on change: an emergency
 * contact is a name, a number and a relationship that only mean anything together,
 * and a diver filling this in on arrival is filling in all of it.
 *
 * Empty fields are sent as explicit nulls (`checkInDetailsUpdate`), so clearing a
 * group actually clears it rather than leaving the previous values on the row.
 */
export function CheckInDetailsForm({
  children,
  onSaved,
}: CheckInDetailsFormProps) {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CheckInDetailsInput>({
    resolver: zodResolver(checkInDetailsSchema),
    defaultValues: EMPTY_CHECK_IN_DETAILS,
  });

  // Repaints from what came back, which is what makes `refreshUser()` below the end
  // of a save: the fields show the row rather than what was typed into them.
  const { reset } = form;
  useEffect(() => {
    if (user) reset(checkInDetailsFromUser(user));
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
      onSaved?.();
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to save. Please try again."));
    }
  };

  return (
    <Form {...form}>
      {/* `dialogFormSubmit` unconditionally: one of the two hosts is a dialog, and
          React bubbles submit through its own tree rather than the DOM's, so a
          dialog opened from a page that is itself a form would otherwise submit
          both. Stopping propagation costs the card on `/settings` nothing - its
          siblings there are forms, not ancestors. */}
      <form
        onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
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
                    <DatePicker value={field.value} onChange={field.onChange} />
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
            <legend className="text-sm font-medium">Emergency contact</legend>
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
                    <Input placeholder="Partner, parent, friend…" {...field} />
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
                    <Input placeholder="DAN Europe, DiveAssure…" {...field} />
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
                    <DatePicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>
        </div>

        <FormApiError error={error} className="mt-4" />

        {children}
      </form>
    </Form>
  );
}

/**
 * The submit for the form above, wherever a host chooses to put it.
 *
 * Reads `isSubmitting` off the surrounding form provider rather than taking it as a
 * prop, so the two hosts differ in the wrapper they render it in and in nothing else.
 */
export function CheckInDetailsSubmitButton({
  className,
}: {
  className?: string;
}) {
  const { isSubmitting } = useFormState<CheckInDetailsInput>();

  return (
    <Button type="submit" className={className} disabled={isSubmitting}>
      {isSubmitting ? (
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
  );
}
