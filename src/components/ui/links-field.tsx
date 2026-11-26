"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import {
  ListField,
  listFieldErrors,
  type ListFieldProps,
  type ListShape,
} from "@/components/ui/list-field";
import { LINKS_MAX } from "@/lib/api/links";
import { emptyLink, type LinkFormValue } from "@/lib/validations/links";

const LINKS: ListShape<LinkFormValue> = {
  noun: "link",
  fields: [
    {
      member: "url",
      label: "Web address",
      kind: "url",
      placeholder: "e.g. blueocean.com",
    },
    {
      member: "label",
      label: "Label",
      kind: "text",
      placeholder: "Booking, Instagram, course materials…",
    },
  ],
  cap: LINKS_MAX,
  empty: emptyLink,
  addLabel: "Add a link",
  emptyText: "No links yet.",
  fullText: `${LINKS_MAX} links at most - remove one to add another.`,
};

/** A record's links, in the diver's order. */
export function LinksField(props: ListFieldProps<LinkFormValue>) {
  return <ListField {...props} shape={LINKS} />;
}

/**
 * The Links field of a record's form, for a form whose `links` member holds the
 * rows - the contact, person, course, gear item and trip dialogs.
 */
export function LinksFormField<T extends FieldValues>({
  control,
}: {
  control: Control<T>;
}) {
  return (
    <FormField
      control={control}
      name={"links" as FieldPath<T>}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>Links</FormLabel>
          {/* No `FormMessage`: a failing row leaves the list's own error an
              array, which it would print as the word "undefined". The field
              shows each row's message on the row. */}
          <FormControl
            render={
              <LinksField
                value={(field.value as LinkFormValue[] | undefined) ?? []}
                onChange={field.onChange}
                errors={listFieldErrors(fieldState.error)}
              />
            }
          />
        </FormItem>
      )}
    />
  );
}
