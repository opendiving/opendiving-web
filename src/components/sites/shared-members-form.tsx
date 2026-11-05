"use client";

import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DiveSiteDetailsFields } from "@/components/sites/dive-site-details-fields";
import { ExternalIdsField } from "@/components/sites/external-ids-field";
import { OtherNamesField } from "@/components/sites/other-names-field";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { DialogFooter } from "@/components/ui/dialog";
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
import type { DiveSiteSharedMembers } from "@/lib/api/dive-sites";
import { dialogFormSubmit } from "@/lib/dialog-form";
import {
  sharedMembersFormSchema,
  sharedMembersFormValues,
  sharedMembersFromForm,
  type DiveSiteFormInput,
} from "@/lib/validations/dive-site";
import { MAX_LOCATION_NAME_LENGTH } from "@/lib/validations/location";

export interface SharedMembersFormProps {
  // What the form starts from, read when it mounts: key it to start over.
  members: DiveSiteSharedMembers;
  // Handed the whole record, every member named. A rejection is the caller's to
  // catch, and `error` is how it says why.
  onSubmit: (members: DiveSiteSharedMembers) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  submitDisabled?: boolean;
  // The API's refusal, under the fields.
  error: string | null;
  // Anything the caller asks of the person before the submit, such as a tick.
  children?: ReactNode;
}

// A Commons record's shared members, for a dialog: `DiveSiteDialog` never opens on
// a record, and holds notes and tags beside what is shared. The pin is typed and
// there is no map here, so a surface using this form adds none to `/privacy` §4.4.
// A registry entry can be removed and never typed, as on a diver's own site.
export function SharedMembersForm({
  members,
  onSubmit,
  onCancel,
  submitLabel,
  submitDisabled = false,
  error,
  children,
}: SharedMembersFormProps) {
  const form = useForm<DiveSiteFormInput>({
    resolver: zodResolver(sharedMembersFormSchema),
    defaultValues: sharedMembersFormValues(members),
  });
  const { isSubmitting } = form.formState;

  return (
    <Form {...form}>
      {/* `dialogFormSubmit` for the reason `DiveSiteDialog` has it. */}
      <form
        onSubmit={dialogFormSubmit(
          form.handleSubmit((data) => onSubmit(sharedMembersFromForm(data))),
        )}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl render={<Input {...field} />} />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="other_names"
          render={({ field }) => (
            <OtherNamesField
              value={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />

        {/* No `inputMode`, for the reason `DiveSiteDialog` gives: a coordinate needs
            its minus. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="latitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Latitude</FormLabel>
                <FormControl render={<Input {...field} />} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="longitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Longitude</FormLabel>
                <FormControl render={<Input {...field} />} />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <FormControl
                render={
                  <Input
                    maxLength={MAX_LOCATION_NAME_LENGTH}
                    value={field.value?.name ?? ""}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value.trim()
                          ? { name: event.target.value }
                          : null,
                      )
                    }
                    onBlur={field.onBlur}
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <DiveSiteDetailsFields control={form.control} withTags={false} />

        <FormField
          control={form.control}
          name="external_ids"
          render={({ field }) => (
            <ExternalIdsField
              value={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />

        {children}

        <FormApiError error={error} />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitDisabled || isSubmitting}>
            {isSubmitting && <ButtonSpinner />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
