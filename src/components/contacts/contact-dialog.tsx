"use client";

import { useEffect, useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Loader2, Plus, Save } from "lucide-react";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";
import { FormApiError } from "@/components/ui/form-api-error";
import {
  contactSchema,
  contactAddressFromForm,
  contactAddressToForm,
  EMPTY_CONTACT_ADDRESS,
  normalizeWebsite,
  type ContactInput,
} from "@/lib/validations/contact";
import {
  contactsAPI,
  CONTACT_ROLES,
  CONTACT_ROLE_LABELS,
  type Contact,
  type ContactRole,
} from "@/lib/api/contacts";
import { formatContactAddress } from "@/lib/contact";
import { getApiErrorMessage } from "@/lib/api/error";
import { dialogFormSubmit } from "@/lib/dialog-form";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pass an existing contact to edit it; omit to create a new one.
  contact?: Contact | null;
  // Called with the created/updated contact so the caller can refresh whatever
  // list it's showing - and, in the pickers, select it straight away.
  onSaved: (contact: Contact) => void;
  // Prefills the name with whatever was typed into the picker before "Add...".
  initialName?: string;
  // The roles a new contact starts with, from the host it is created on - a
  // course's is a school, a trip part's a place to stay. A suggestion only: the
  // row means what the diver leaves ticked. Ignored when editing.
  initialRoles?: readonly ContactRole[];
}

// The address group's parts in the order a postal address is written, with the
// label each one shows. `country` is last and the one the group cannot go without.
const ADDRESS_PARTS = [
  { name: "street", label: "Street" },
  { name: "city", label: "City" },
  { name: "postcode", label: "Postcode" },
  { name: "region", label: "Region" },
  { name: "country", label: "Country" },
] as const;

// The one create/edit form for a contact, used by the contacts page and by every
// picker that names one - the dive, course, certification and service-record
// forms and a trip part's accommodation. A dialog for the reason `CourseDialog`
// is one: the flow that matters is adding a dive center from inside a half-filled
// form, and navigating away would lose it.
export function ContactDialog({
  open,
  onOpenChange,
  contact,
  onSaved,
  initialName,
  initialRoles,
}: ContactDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useDialogApiError(open);
  // Collapsed on a new contact, which most often has no address worth typing -
  // a boat, a friend's flat - and open on one that has an address to show.
  const [isAddressOpen, setIsAddressOpen] = useState(false);
  // Raised when a submit fails on a part of the address, so the country box is
  // focused once the group that holds it is open. A fresh object each time, so a
  // second refusal focuses it again - the shape `DiveFormCard`'s request has.
  const [focusRequest, setFocusRequest] = useState<object | null>(null);
  const addressId = useId();
  const isEdit = !!contact;

  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      roles: [],
      phone: "",
      email: "",
      website: "",
      address: EMPTY_CONTACT_ADDRESS,
      notes: "",
    },
  });

  const address = useWatch({ control: form.control, name: "address" });
  const addressSummary = formatContactAddress(address);

  // Compared by value: a host passing `["school"]` inline hands over a new array
  // every render, and an identity in the deps below would reset the form under
  // the diver's typing on each one.
  const initialRolesKey = (initialRoles ?? []).join(",");

  // Reload the form whenever the dialog opens, so it shows the contact being
  // edited rather than whatever the previous invocation left behind.
  const { reset, setFocus } = form;
  useEffectOnChange(() => {
    if (!open) return;
    reset({
      name: contact?.name ?? initialName ?? "",
      roles: contact
        ? contact.roles
        : initialRolesKey
          ? initialRolesKey.split(",")
          : [],
      phone: contact?.phone ?? "",
      email: contact?.email ?? "",
      website: contact?.website ?? "",
      address: contactAddressToForm(contact?.address),
      notes: contact?.notes ?? "",
    });
    setIsAddressOpen(!!contact?.address);
    // Same deliberate reset-on-open pattern as `course-dialog.tsx`.
  }, [open, contact, initialName, initialRolesKey, reset]);

  useEffect(() => {
    if (focusRequest) setFocus("address.country");
  }, [focusRequest, setFocus]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setApiError(null);
    onOpenChange(next);
  };

  // A collapsed group still validates, so a refused country would otherwise block
  // the save with its message out of sight.
  const onInvalid = (errors: Record<string, unknown>) => {
    if (!errors.address) return;
    setIsAddressOpen(true);
    setFocusRequest({});
  };

  const onSubmit = async (data: ContactInput) => {
    setApiError(null);
    try {
      setIsSubmitting(true);

      // "" is the form's "not set" for every optional field. It goes as an
      // explicit null, which on an update is what clears a stored value; `notes`
      // is the exception, being a string the API never takes as null.
      const shared = {
        name: data.name,
        roles: data.roles,
        phone: data.phone.trim() || null,
        email: data.email || null,
        website: normalizeWebsite(data.website),
        address: contactAddressFromForm(data.address),
        notes: data.notes,
      };

      if (contact) {
        // The API answers a PATCH with a status message only, so the updated
        // contact is assembled here for the caller - with its roles in the
        // vocabulary's order, which is how the API stores them.
        await contactsAPI.updateContact(contact.uuid, shared);
        onSaved({
          ...contact,
          ...shared,
          roles: [
            ...CONTACT_ROLES.filter((role) => shared.roles.includes(role)),
            ...shared.roles.filter(
              (role) => !(CONTACT_ROLES as readonly string[]).includes(role),
            ),
          ],
        });
      } else {
        onSaved(await contactsAPI.createContact(shared));
      }

      onOpenChange(false);
    } catch (error) {
      setApiError(
        getApiErrorMessage(
          error,
          `Failed to ${isEdit ? "update" : "create"} contact. Please try again.`,
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Contact" : "New Contact"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          {/* `dialogFormSubmit` keeps this submit from bubbling into the form
              this dialog is opened from - the dive form, or a dialog of its own
              such as the certification dialog's course dialog. See
              `lib/dialog-form.ts`. */}
          <form
            onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit, onInvalid))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Blue Ocean Dive Center"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="roles"
              render={({ field }) => (
                <FormItem>
                  {/* A group of boxes rather than one select: a resort is a dive
                      center and a place to stay at once, and the set is what the
                      diver means. Each row is the label, so the whole 44px line
                      is the target rather than the 16px box. */}
                  <fieldset>
                    <legend className="text-sm font-medium leading-none">
                      Roles
                    </legend>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 sm:grid-cols-3">
                      {CONTACT_ROLES.map((role) => (
                        <label
                          key={role}
                          className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={field.value.includes(role)}
                            onChange={(event) =>
                              field.onChange(
                                event.target.checked
                                  ? [...field.value, role]
                                  : field.value.filter(
                                      (value) => value !== role,
                                    ),
                              )
                            }
                          />
                          {CONTACT_ROLE_LABELS[role]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input type="tel" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    {/* Not `type="url"`: the browser would refuse the bare host
                        a diver copies off a sign, which is the case the scheme
                        is added on save for. */}
                    <Input
                      inputMode="url"
                      autoComplete="off"
                      placeholder="e.g. blueocean.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-md border">
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={isAddressOpen}
                aria-controls={addressId}
                onClick={() => setIsAddressOpen((open) => !open)}
              >
                <span className="shrink-0">Address</span>
                {/* What the collapsed group holds, so closing it never hides that
                    there is one. */}
                {!isAddressOpen && addressSummary && (
                  <span className="min-w-0 flex-1 truncate font-normal text-muted-foreground">
                    {addressSummary}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    isAddressOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
              {/* Kept mounted while collapsed, so what was typed survives a close
                  and the resolver still sees every part. */}
              <div
                id={addressId}
                hidden={!isAddressOpen}
                className="grid gap-4 border-t p-3 sm:grid-cols-2"
              >
                {ADDRESS_PARTS.map((part) => (
                  <FormField
                    key={part.name}
                    control={form.control}
                    name={`address.${part.name}`}
                    render={({ field }) => (
                      <FormItem
                        className={cn(
                          part.name === "street" && "sm:col-span-2",
                        )}
                      >
                        <FormLabel>
                          {part.label}
                          {/* Required only once the group holds anything - an
                              empty group is no address at all. */}
                          {part.name === "country" && addressSummary && " *"}
                        </FormLabel>
                        <FormControl>
                          <Input autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Opening hours, who to ask for, what to bring..."
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormApiError error={apiError} />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isEdit ? "Saving..." : "Creating..."}
                  </>
                ) : isEdit ? (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save changes
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create contact
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
