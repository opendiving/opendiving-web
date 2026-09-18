"use client";

import { type ReactNode, useState } from "react";
import {
  useForm,
  useFormState,
  type Control,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";
import { authAPI } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/error";
import { dialogFormSubmit } from "@/lib/dialog-form";
import {
  EMPTY_USER_FIELDS,
  userFieldsFromUser,
  userFieldsSchema,
  userFieldsUpdate,
  type UserFieldKey,
  type UserFieldValues,
} from "@/lib/validations/user-fields";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FormApiError } from "@/components/ui/form-api-error";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

// How each field is written on screen. A `Record` over the key union, like the
// schemas it pairs with, so a field added to one and not the other is a type error
// rather than a box with no label.
const FIELD_SPECS: Record<
  UserFieldKey,
  {
    label: string;
    kind: "text" | "tel" | "date";
    placeholder?: string;
    description?: string;
  }
> = {
  name: {
    label: "Full name",
    kind: "text",
    placeholder: "Enter your full name",
  },
  username: {
    label: "Username",
    kind: "text",
    placeholder: "Choose a username",
    description: "Lowercase letters and numbers, unique across OpenDiving.",
  },
  date_of_birth: { label: "Date of birth", kind: "date" },
  phone: { label: "Phone number", kind: "tel" },
  insurance_provider: {
    label: "Provider",
    kind: "text",
    placeholder: "DAN Europe, DiveAssure…",
  },
  insurance_policy_number: { label: "Policy number", kind: "text" },
  insurance_expires_on: { label: "Expires on", kind: "date" },
  emergency_contact_name: { label: "Name", kind: "text" },
  emergency_contact_phone: { label: "Their phone number", kind: "tel" },
  emergency_contact_relationship: {
    label: "Relationship to you",
    kind: "text",
    placeholder: "Partner, parent, friend…",
  },
};

/** A run of fields under one optional legend. */
export interface UserFieldGroup {
  /** Omitted by a form whose whole subject is already its heading - every dialog. */
  legend?: string;
  fields: UserFieldKey[];
}

export interface UserFieldsFormProps {
  groups: UserFieldGroup[];
  /**
   * The footer this host puts under the fields - a settings card's full-width
   * button, a dialog's Cancel/Save row. It renders inside the `<form>` and inside the
   * form provider, so `UserFieldsSubmitButton` works wherever it is put.
   */
  children: ReactNode;
  /** Ran once the account has been re-read, which is what closes a dialog. */
  onSaved?: () => void;
  /** What the toast says on success. */
  savedMessage?: string;
}

/**
 * One form over any subset of the signed-in diver's own fields.
 *
 * `/settings` shows them in cards and `/checkin` in dialogs over the summary that
 * prints them - a diver stood at a dive-shop desk has just been asked for the thing
 * that is missing, and sending them to `/settings` and back is two navigations away
 * from the page they are about to hand over. Both surfaces are this component with a
 * different `groups`, so a field cannot be worded, bounded or cleared differently
 * depending on where it was edited.
 *
 * Only the fields in `groups` are sent (`userFieldsUpdate`), and an emptied optional
 * one goes as an explicit `null` so clearing it actually clears it.
 */
export function UserFieldsForm({
  groups,
  children,
  onSaved,
  savedMessage = "Your details are up to date.",
}: UserFieldsFormProps) {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const fields = groups.flatMap((group) => group.fields);

  const form = useForm<UserFieldValues>({
    // The schema is assembled from `fields` at runtime, so zod infers its output as
    // an index signature rather than as `UserFieldValues` and the resolver types
    // cannot be related without going through `unknown`. The keys are the same union
    // either way - `userFieldsSchema` picks them out of a `Record` over it - and
    // `useForm<UserFieldValues>` is what keeps every field name below checked.
    resolver: zodResolver(
      userFieldsSchema(fields),
    ) as unknown as Resolver<UserFieldValues>,
    defaultValues: EMPTY_USER_FIELDS,
  });

  // Repaints from what came back, which is what makes `refreshUser()` below the end
  // of a save: the boxes show the row rather than what was typed into them. Not on
  // the way back to a kept-mounted route, though, where a plain effect re-runs
  // against an unchanged `user` and paints over a half-filled card -
  // `useEffectOnChange` says why.
  const { reset } = form;
  useEffectOnChange(() => {
    if (user) reset(userFieldsFromUser(user));
  }, [user, reset]);

  const onSubmit = async () => {
    setError(null);
    try {
      // Read from the form rather than from what the resolver hands back: the
      // schema covers only the fields on screen, so its parse result is the same
      // subset by a longer route, and this way the payload and the rendering are
      // built from one list.
      await authAPI.updateProfile(userFieldsUpdate(fields, form.getValues()));
      await refreshUser();
      toast({ title: "Saved", description: savedMessage });
      onSaved?.();
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to save. Please try again."));
    }
  };

  return (
    <Form {...form}>
      {/* `dialogFormSubmit` unconditionally: most hosts of this form are dialogs, and
          React bubbles submit through its own tree rather than the DOM's, so a dialog
          opened from a page that is itself a form would otherwise submit both.
          Stopping propagation costs a settings card nothing - its siblings there are
          forms, not ancestors. */}
      <form
        onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
        className="flex flex-col flex-1"
      >
        <div className="space-y-6 flex-1">
          {groups.map((group, at) => (
            <fieldset key={group.legend ?? at} className="space-y-4">
              {group.legend && (
                <legend className="text-sm font-medium">{group.legend}</legend>
              )}
              {group.fields.map((field) => (
                <UserField key={field} name={field} control={form.control} />
              ))}
            </fieldset>
          ))}
        </div>

        <FormApiError error={error} className="mt-4" />

        {children}
      </form>
    </Form>
  );
}

function UserField({
  name,
  control,
}: {
  name: UserFieldKey;
  control: Control<UserFieldValues>;
}) {
  const spec = FIELD_SPECS[name];

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{spec.label}</FormLabel>
          <FormControl>
            {spec.kind === "date" ? (
              <DatePicker value={field.value} onChange={field.onChange} />
            ) : (
              <Input
                type={spec.kind === "tel" ? "tel" : "text"}
                placeholder={spec.placeholder}
                {...field}
              />
            )}
          </FormControl>
          {spec.description && (
            <FormDescription>{spec.description}</FormDescription>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * The submit for the form above, wherever a host chooses to put it.
 *
 * Reads `isSubmitting` off the surrounding form provider rather than taking it as a
 * prop, so the hosts differ in the wrapper they render it in and in nothing else.
 */
export function UserFieldsSubmitButton({ className }: { className?: string }) {
  const { isSubmitting } = useFormState<UserFieldValues>();

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
