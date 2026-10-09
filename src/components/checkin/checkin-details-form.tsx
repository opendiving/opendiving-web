"use client";

import { type ReactNode, useState } from "react";
import { useForm, type Control, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useCheckinDetails } from "@/contexts/CheckinDetailsContext";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";
import { usePictureEdit } from "@/hooks/usePictureEdit";
import { authAPI } from "@/lib/api/auth";
import type { CheckinDetails } from "@/lib/api/checkin-details";
import { getApiErrorMessage } from "@/lib/api/error";
import { dialogFormSubmit } from "@/lib/dialog-form";
import { PICTURE_LABEL, type PictureKind } from "@/lib/picture";
import { applyPictureEdit } from "@/lib/picture-edits";
import {
  CHECKIN_GROUPS,
  checkinDetailsPatch,
  checkinDetailsSchema,
  checkinFormValues,
  type CheckinDetailsFormValues,
  type CheckinGroup,
  type CheckinMemberKey,
} from "@/lib/validations/checkin-details";
import { USER_FIELD_SCHEMAS } from "@/lib/validations/user-fields";
import {
  EmergencyContactsField,
  InsurancePoliciesField,
  listFieldErrors,
} from "@/components/checkin/checkin-list-field";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { PictureField } from "@/components/user/picture-field";
import { UserFieldsSubmitButton } from "@/components/user/user-fields-form";

/**
 * What each check-in group is called, and the line under it, on every surface that
 * gives a group a heading of its own: a `/checkin` dialog, a `/settings` card, the
 * bell's insurance dialog.
 */
export const CHECK_IN_GROUP_HEADINGS: Record<
  CheckinGroup,
  { title: string; description: string }
> = {
  about: {
    title: "About You",
    description: "Your own details, as a desk asks for them.",
  },
  insurance: {
    title: "Dive Insurance",
    description:
      "Each policy a shop takes down: the provider, the policy number, and when the cover runs out.",
  },
  emergency: {
    title: "Emergency Contacts",
    description:
      "Who a shop calls if something goes wrong, and how they know you. The first is called first.",
  },
};

// How each scalar member is written on screen. They describe the diver, so the
// phone and email boxes say so to the browser's autofill.
const SCALAR_SPECS = {
  date_of_birth: { label: "Date of birth", kind: "date" },
  phone: { label: "Phone number", kind: "tel", autoComplete: "tel" },
  email: {
    label: "Email",
    kind: "email",
    autoComplete: "email",
    description:
      "Printed on your check-in sheet and carried in your exports. The address you sign in with stays private.",
  },
} as const satisfies Record<
  "date_of_birth" | "phone" | "email",
  {
    label: string;
    kind: "date" | "tel" | "email";
    autoComplete?: string;
    description?: string;
  }
>;

/** The sheet's About You dialog edits the account's name beside the object. */
type CheckinFormValues = CheckinDetailsFormValues & { name: string };

/**
 * One member of the check-in details as every form over them writes it: a scalar as a
 * labelled box, a list as its row editor. `hideLabel` keeps the label for a screen
 * reader only, for a host whose legend already says it.
 */
export function CheckinMemberField({
  member,
  control,
  hideLabel = false,
}: {
  member: CheckinMemberKey;
  control: Control<CheckinDetailsFormValues>;
  hideLabel?: boolean;
}) {
  if (member === "emergency_contacts" || member === "insurance_policies") {
    const label =
      member === "emergency_contacts"
        ? "Emergency contacts"
        : "Insurance policies";
    return (
      <FormField
        control={control}
        name={member}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel className={hideLabel ? "sr-only" : undefined}>
              {label}
            </FormLabel>
            {/* No `FormMessage`: a failing row leaves the list's own error an array,
                which it would print as the word "undefined". The field shows each
                row's message on the row. */}
            <FormControl>
              {member === "emergency_contacts" ? (
                <EmergencyContactsField
                  value={field.value as CheckinDetailsFormValues[typeof member]}
                  onChange={field.onChange}
                  errors={listFieldErrors(fieldState.error)}
                />
              ) : (
                <InsurancePoliciesField
                  value={field.value as CheckinDetailsFormValues[typeof member]}
                  onChange={field.onChange}
                  errors={listFieldErrors(fieldState.error)}
                />
              )}
            </FormControl>
          </FormItem>
        )}
      />
    );
  }

  const spec: {
    label: string;
    kind: string;
    autoComplete?: string;
    description?: string;
  } = SCALAR_SPECS[member];
  return (
    <FormField
      control={control}
      name={member}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={hideLabel ? "sr-only" : undefined}>
            {spec.label}
          </FormLabel>
          <FormControl>
            {spec.kind === "date" ? (
              <DatePicker value={field.value} onChange={field.onChange} />
            ) : (
              <Input
                type={spec.kind}
                autoComplete={spec.autoComplete}
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

export interface CheckinDetailsFormProps {
  group: CheckinGroup;
  /** The sheet's About You: the account's name, sent to `PATCH /user` when changed. */
  withName?: boolean;
  /** The portrait, edited above the fields and sent after them. */
  picture?: PictureKind;
  /**
   * The footer this host puts under the fields - a settings card's full-width
   * button, a dialog's Cancel/Save row - inside the `<form>` and its provider.
   */
  children: ReactNode;
  /** Ran once the save has landed, which is what closes a dialog. */
  onSaved?: () => void;
  savedMessage?: string;
}

/**
 * One group of the check-in details, on every surface that edits one: a `/settings`
 * card, a `/checkin` dialog, the bell's insurance dialog. Each is this component with a
 * different `group`, so a member cannot be worded, bounded or cleared differently
 * depending on where it was edited.
 *
 * Nothing is offered until the shared copy has loaded - a form seeded from a copy that
 * never arrived would send its group empty and clear it - so until then this is a
 * placeholder, and after a failed read it says so and offers the read again.
 */
export function CheckinDetailsForm(props: CheckinDetailsFormProps) {
  const { details, loadFailed, reload } = useCheckinDetails();

  if (!details) {
    return loadFailed ? (
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Your check-in details didn&rsquo;t load.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={reload}>
          Try again
        </Button>
      </div>
    ) : (
      <div
        role="status"
        aria-label="Loading your check-in details"
        className="space-y-3"
      >
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  return <LoadedForm {...props} details={details} />;
}

function LoadedForm({
  group,
  withName = false,
  picture,
  children,
  onSaved,
  savedMessage = "Your check-in details are up to date.",
  details,
}: CheckinDetailsFormProps & { details: CheckinDetails }) {
  const { user, refreshUser } = useAuth();
  const { save } = useCheckinDetails();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pictureEdit, setPictureEdit] = usePictureEdit();

  const members = CHECKIN_GROUPS[group];
  const stored: CheckinFormValues = {
    ...checkinFormValues(details),
    name: user?.name ?? "",
  };

  const form = useForm<CheckinFormValues>({
    // Through `unknown`: a schema assembled from a runtime list infers an index
    // signature, and `useForm<CheckinFormValues>` is what keeps the names checked.
    resolver: zodResolver(
      withName
        ? checkinDetailsSchema(members).extend({
            name: USER_FIELD_SCHEMAS.name,
          })
        : checkinDetailsSchema(members),
    ) as unknown as Resolver<CheckinFormValues>,
    defaultValues: stored,
  });

  // Repaints from what the save answered, keyed on this form's own group and its own
  // saves rather than on the whole object: a sibling form saving its group replaces
  // the shared copy, and what is half-typed here must survive that. `saves` covers a
  // save that changed nothing, a trimmed value say. `useEffectOnChange` so a route
  // shown again does not paint over a half-filled form.
  const { reset } = form;
  const [saves, setSaves] = useState(0);
  const storedHere = JSON.stringify([
    ...members.map((member) => stored[member]),
    withName ? stored.name : null,
  ]);
  useEffectOnChange(() => reset(stored), [storedHere, saves, reset]);

  const onSubmit = async () => {
    setError(null);
    const values = form.getValues();
    const name = values.name.trim();
    const nameChanged = withName && !!user && name !== user.name;
    const sending = picture && pictureEdit ? { picture, pictureEdit } : null;
    try {
      // The name first, as `UserFieldsForm` sends its fields before a picture: a
      // name the account refuses stops the save before anything else is written.
      if (nameChanged) await authAPI.updateProfile({ name });
      await save(checkinDetailsPatch(members, values));
      let pictureError: unknown = null;
      if (sending) {
        try {
          await applyPictureEdit(sending.picture, sending.pictureEdit);
        } catch (caught) {
          console.error(`Failed to save the ${sending.picture}:`, caught);
          pictureError = caught ?? new Error("picture failed");
        } finally {
          setPictureEdit(null);
        }
      }
      // Only for what the user record carries, before the toast so the page has
      // changed by the time it says so.
      if (nameChanged || sending) await refreshUser();
      setSaves((count) => count + 1);
      if (pictureError && picture) {
        toast({
          title: `Saved, but your ${PICTURE_LABEL[picture]} did not`,
          description: getApiErrorMessage(
            pictureError,
            "Try picking the photo again.",
          ),
          variant: "destructive",
        });
      } else {
        toast({ title: "Saved", description: savedMessage });
      }
      onSaved?.();
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to save. Please try again."));
    }
  };

  const signInEmail = user?.email;
  // The cast narrows the form to the members it shares with the import preview's,
  // which is all a member field reads; `name` is this form's alone.
  const control = form.control as unknown as Control<CheckinDetailsFormValues>;

  return (
    <Form {...form}>
      {/* `dialogFormSubmit` unconditionally, as `UserFieldsForm` has it: most hosts
          are dialogs, and React bubbles submit through its own tree. */}
      <form
        onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
        className="flex flex-col flex-1"
      >
        <div className="space-y-4 flex-1">
          {picture && (
            <PictureField
              picture={picture}
              edit={pictureEdit}
              onChange={setPictureEdit}
              disabled={form.formState.isSubmitting}
            />
          )}
          {withName && (
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input type="text" autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {members.map((member) => (
            <div key={member} className="space-y-2">
              <CheckinMemberField
                member={member}
                control={control}
                // A card or dialog holding one list is headed by what the list is.
                hideLabel={members.length === 1}
              />
              {/* Filled here and saved with the rest, so choosing to hand out the
                  sign-in address costs one click and no request of its own. */}
              {member === "email" && signInEmail && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() =>
                    form.setValue("email", signInEmail, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  Use my sign-in email
                </Button>
              )}
            </div>
          ))}
        </div>

        <FormApiError error={error} className="mt-4" />

        {children}
      </form>
    </Form>
  );
}
