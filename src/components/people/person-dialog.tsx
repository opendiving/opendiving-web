"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Save } from "lucide-react";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";
import { FormApiError } from "@/components/ui/form-api-error";
import {
  normalizeLinkedUsername,
  personSchema,
  type PersonInput,
} from "@/lib/validations/person";
import { peopleAPI, type Person } from "@/lib/api/people";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/error";
import { dialogFormSubmit } from "@/lib/dialog-form";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface PersonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pass an existing person to edit it; omit to create a new one.
  person?: Person | null;
  // Called with the created/updated person so the caller can refresh whatever
  // list it's showing - and, in the pickers, add it straight away.
  onSaved: (person: Person) => void;
  // Prefills the name with whatever was typed into the picker before "Add...".
  initialName?: string;
}

// The one create/edit form for a person, used by the People page and by every
// picker that names one - the dive, trip, course and certification forms. A
// dialog for the reason `ContactDialog` is one: the flow that matters is adding
// someone from inside a half-filled form. The pickers create a name-only person
// on Enter without it; this is for what a name cannot carry - the username of
// their account here, an email, a phone.
export function PersonDialog({
  open,
  onOpenChange,
  person,
  onSaved,
  initialName,
}: PersonDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useDialogApiError(open);
  const isEdit = !!person;

  const form = useForm<PersonInput>({
    resolver: zodResolver(personSchema),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      phone: "",
      notes: "",
    },
  });

  // Reload the form whenever the dialog opens, so it shows the person being
  // edited rather than whatever the previous invocation left behind.
  const { reset, setError, setFocus } = form;
  useEffectOnChange(() => {
    if (!open) return;
    reset({
      name: person?.name ?? initialName ?? "",
      username: person?.username ?? "",
      email: person?.email ?? "",
      phone: person?.phone ?? "",
      notes: person?.notes ?? "",
    });
    // Same deliberate reset-on-open pattern as `contact-dialog.tsx`.
  }, [open, person, initialName, reset]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setApiError(null);
    onOpenChange(next);
  };

  const onSubmit = async (data: PersonInput) => {
    setApiError(null);
    try {
      setIsSubmitting(true);

      // "" is the form's "not set" for every optional field. It goes as an
      // explicit null, which on an update is what clears a stored value - and,
      // for the username, what unlinks the person. `notes` is the exception,
      // being a string the API never takes as null.
      const shared = {
        name: data.name.trim(),
        username: normalizeLinkedUsername(data.username),
        email: data.email || null,
        phone: data.phone.trim() || null,
        notes: data.notes,
      };

      if (person) {
        // The API answers a PATCH with a status message only, so the updated
        // person is assembled here for the caller. The username is exactly what
        // was sent: the API links on an exact match, so an accepted one is that
        // account's username as it stands.
        await peopleAPI.updatePerson(person.uuid, shared);
        onSaved({ ...person, ...shared });
      } else {
        onSaved(await peopleAPI.createPerson(shared));
      }

      onOpenChange(false);
    } catch (error) {
      // The API refuses a username on the field itself - no such account, your
      // own, one another of your people already links - so it is shown there,
      // beside what the diver typed. Everything else, the flat 422 a duplicate
      // name gets and the 429 past the linking limit among it, is the dialog's.
      const usernameError = getApiFieldError(error, "username");
      if (usernameError) {
        setError("username", { message: usernameError });
        setFocus("username");
        return;
      }
      setApiError(
        getApiErrorMessage(
          error,
          `Failed to ${isEdit ? "update" : "create"} person. Please try again.`,
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
          <DialogTitle>{isEdit ? "Edit Person" : "New Person"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          {/* `dialogFormSubmit` keeps this submit from bubbling into the form
              this dialog is opened from - the dive form, or a dialog of its own
              such as the course dialog. See `lib/dialog-form.ts`. */}
          <form
            onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Alex M." autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. alexm"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      {...field}
                    />
                  </FormControl>
                  {/* What the link does and does not do, said where it is made:
                      the privacy page is not where a diver reads it first. */}
                  <FormDescription>
                    Their username on this copy of OpenDiving, if they have an
                    account. You will see its current username and nothing else
                    of theirs, and they are not told.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="How you met, what they dive, anything worth remembering..."
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
                    Create person
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
