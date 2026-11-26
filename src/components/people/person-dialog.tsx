"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";
import { FormApiError } from "@/components/ui/form-api-error";
import { personSchema, type PersonInput } from "@/lib/validations/person";
import {
  peopleAPI,
  type Person,
  type PersonConnection,
} from "@/lib/api/people";
import {
  getApiDuplicateError,
  getApiErrorMessage,
  getApiFieldError,
} from "@/lib/api/error";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DialogSubmitButton } from "@/components/ui/dialog-submit-button";
import { CustomPropertiesField } from "@/components/ui/custom-properties-field";
import { customPropertiesUpdate } from "@/lib/custom-properties";
import {
  ConnectedAccountHead,
  connectTargetSource,
  type ConnectTarget,
} from "@/components/people/connected-account-head";
import { useConnectCandidates } from "@/components/people/use-connect-candidates";

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
  // The account the person is to be connected to - through a followed connect
  // link, or Add on a row under Added you. The form then offers one of the
  // diver's people who is not connected yet in place of a new one.
  connecting?: ConnectTarget | null;
}

const NEW_PERSON = "";

function connectionOf(target: ConnectTarget): PersonConnection {
  return target.via === "link"
    ? { connect_link: target.token }
    : { connect_account: target.uuid };
}

// The one create/edit form for a person, used by the People page, by every
// picker that names one - the dive, trip, course and certification forms - and
// by the two ways of connecting one, the connect page and Added you. A dialog for
// the reason `ContactDialog` is one: the flow that matters is adding someone from
// inside a half-filled form. The pickers create a name-only person on Enter
// without it; this is for what a name cannot carry - an email, a phone, notes.
export function PersonDialog({
  open,
  onOpenChange,
  person,
  onSaved,
  initialName,
  connecting,
}: PersonDialogProps) {
  const [apiError, setApiError, handleOpenChange] = useDialogApiError(
    open,
    onOpenChange,
  );
  const isEdit = !!person;
  const candidates = useConnectCandidates(open ? connecting : null);
  // Which of the diver's people the connection goes to; `NEW_PERSON` makes one.
  // Unset until the diver picks, so the form opens on the person named as the
  // account is, once the list has loaded.
  const [picked, setPicked] = useState<string | null>(null);
  const target = picked ?? candidates.suggested ?? NEW_PERSON;

  const form = useForm<PersonInput>({
    resolver: zodResolver(personSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      notes: "",
      custom_properties: [],
    },
  });

  // Reload the form whenever the dialog opens, so it shows the person being
  // edited rather than whatever the previous invocation left behind.
  const { reset, setError, setFocus } = form;
  useEffectOnChange(() => {
    if (!open) return;
    reset({
      name: person?.name ?? connecting?.name ?? initialName ?? "",
      email: person?.email ?? "",
      phone: person?.phone ?? "",
      notes: person?.notes ?? "",
      custom_properties: person?.custom_properties ?? [],
    });
    setPicked(null);
    // Same deliberate reset-on-open pattern as `contact-dialog.tsx`.
  }, [open, person, connecting, initialName, reset]);

  const connectingExisting = !!connecting && target !== NEW_PERSON;

  const onSubmit = async (data: PersonInput) => {
    setApiError(null);
    try {
      const connection = connecting ? connectionOf(connecting) : {};
      if (connecting && target !== NEW_PERSON) {
        // The person keeps everything the diver recorded; only the tie is new,
        // and the person read back is what carries the account's picture.
        await peopleAPI.updatePerson(target, connection);
        onSaved(await peopleAPI.getPerson(target));
        onOpenChange(false);
        return;
      }

      // "" is the form's "not set" for every optional field. It goes as an
      // explicit null, which on an update is what clears a stored value. `notes`
      // is the exception, being a string the API never takes as null.
      const fields = {
        name: data.name.trim(),
        email: data.email.trim() || null,
        phone: data.phone.trim() || null,
        notes: data.notes,
        custom_properties: customPropertiesUpdate(
          person?.custom_properties,
          data.custom_properties,
        ),
      };

      if (person) {
        // The API answers a PATCH with a status message only, so the updated
        // person is assembled here for the caller.
        await peopleAPI.updatePerson(person.uuid, fields);
        onSaved({ ...person, ...fields });
      } else {
        onSaved(await peopleAPI.createPerson({ ...fields, ...connection }));
      }

      onOpenChange(false);
    } catch (error) {
      // A connection the API refuses - the link no longer live, the account
      // already connected to another of the diver's people - is refused on its
      // member, which no field here shows, so it is the dialog's message. A name
      // already taken is a flat 422, shown on the name field.
      const connectionError =
        getApiFieldError(error, "connect_link") ??
        getApiFieldError(error, "connect_account");
      if (connectionError) {
        setApiError(connectionError);
        return;
      }
      const duplicate = getApiDuplicateError(error);
      if (duplicate && !connectingExisting) {
        setError("name", { message: duplicate });
        setFocus("name");
        return;
      }
      setApiError(
        getApiErrorMessage(
          error,
          connecting
            ? "Failed to add them to your people. Please try again."
            : `Failed to ${isEdit ? "update" : "create"} person. Please try again.`,
        ),
      );
    }
  };

  const title = connecting
    ? "Add to your people"
    : isEdit
      ? "Edit Person"
      : "New Person";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {connecting ? (
          <ConnectedAccountHead
            source={connectTargetSource(connecting)}
            avatarSha={connecting.avatarSha}
            username={connecting.username}
            accountName={connecting.name}
            fallbackName={connecting.name}
          />
        ) : (
          person?.username && (
            <ConnectedAccountHead
              source={{ kind: "person", uuid: person.uuid }}
              avatarSha={person.avatar_sha256}
              username={person.username}
              fallbackName={person.name}
            />
          )
        )}

        <Form {...form}>
          {/* `dialogFormSubmit` keeps this submit from bubbling into the form
              this dialog is opened from - the dive form, or a dialog of its own
              such as the course dialog. See `lib/dialog-form.ts`. */}
          <form
            onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
            className="space-y-4"
          >
            {connecting && candidates.people.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="person-connect-target">Add as</Label>
                <NativeSelect
                  id="person-connect-target"
                  value={target}
                  onChange={(event) => setPicked(event.target.value)}
                >
                  <option value={NEW_PERSON}>A new person</option>
                  {candidates.people.map((candidate) => (
                    <option key={candidate.uuid} value={candidate.uuid}>
                      {candidate.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}

            {connectingExisting ? (
              <p className="text-sm text-muted-foreground">
                They keep their name and everything you have recorded about
                them, and the dives that name them still do.
              </p>
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl
                        render={
                          <Input
                            placeholder="e.g. Alex M."
                            autoFocus
                            {...field}
                          />
                        }
                      />
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
                        <FormControl
                          render={
                            <Input type="email" autoComplete="off" {...field} />
                          }
                        />
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
                        <FormControl
                          render={
                            <Input type="tel" autoComplete="off" {...field} />
                          }
                        />
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
                      <FormControl
                        render={
                          <Textarea
                            placeholder="How you met, what they dive, anything worth remembering..."
                            className="min-h-[80px]"
                            {...field}
                          />
                        }
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* What saving reveals, said before the save: the privacy page is
                not where a diver reads it first. */}
            {connecting && (
              <p className="text-sm text-muted-foreground">
                {connecting.name} will see your name, username and picture, and
                find you under Added you.
              </p>
            )}

            {!connectingExisting && <CustomPropertiesField />}

            <FormApiError error={apiError} />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <DialogSubmitButton
                isEdit={isEdit}
                createLabel={
                  connecting ? "Add to your people" : "Create person"
                }
                creatingLabel={connecting ? "Adding..." : undefined}
              />
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
