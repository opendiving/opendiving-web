"use client";

import { type FormEvent, useEffect, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { FormApiError } from "@/components/ui/form-api-error";
import { DiveFileImport } from "@/components/dives/dive-file-import";
import {
  DiveFormFields,
  DiveFormValues,
} from "@/components/dives/dive-form-fields";
import { DiveFormActions } from "@/components/dives/dive-form-actions";
import { DiveFormFieldsMenu } from "@/components/dives/dive-form-fields-menu";
import { MixtureFieldArray } from "@/components/dives/mixture-fields";
import { DiveSiteSummary, Recording } from "@/lib/api/dives";
import type { PendingDiveFile } from "@/components/dives/dive-recording-files";
import { GearItemSummary } from "@/lib/api/gear";
import { SpeciesSummary } from "@/lib/api/species";
import {
  diveFormFieldsWithErrors,
  type DiveFormFieldKey,
} from "@/lib/dive-form-fields";
import { describeBlockedSubmit } from "@/lib/form-validity";
import type { DiveFormVisibility } from "@/hooks/useDiveFormVisibility";

export interface DiveFormCardProps<TFieldValues extends DiveFormValues> {
  form: UseFormReturn<TFieldValues>;
  mixtureFieldArray: MixtureFieldArray;
  mode: "create" | "edit";
  userId: string;
  // Created by the page alongside `form`, because the page also owns the moments a
  // value arrives from outside the diver's typing (the edit load, the URL parameters)
  // and the prefill the show/hide rules are defined against.
  visibility: DiveFormVisibility;
  onSubmit: (data: TFieldValues) => void | Promise<void>;
  isSubmitting: boolean;
  cancelHref: string;
  submittingLabel: string;
  submitLabel: string;
  // All five passed straight through to `DiveFileImport`. The page, not this
  // card, owns the picked files: they can only be attached once the dive
  // exists, which is after `onSubmit` resolves.
  onFileAdded?: (pending: PendingDiveFile) => void;
  pendingFiles?: PendingDiveFile[];
  onRemovePendingFile?: (id: string) => void;
  onDeleteStoredFile?: (fileUuid: string) => Promise<void>;
  recordings?: Recording[];
  // The dive being edited, so the import can tell a match against it from a
  // match against some other dive. Absent when creating.
  diveUuid?: string;
  // The dive's existing sites, when editing - see `DiveFormFields`.
  knownDiveSites?: DiveSiteSummary[];
  knownGearItems?: GearItemSummary[];
  knownSpecies?: SpeciesSummary[];
  // Note shown under the dive number - see `DiveFormFields`.
  diveNumberNotice?: { forValue: number; message: string } | null;
}

// The "Dive Details" card shared by the create and edit dive pages: file
// import, the main form fields (including gas mixtures), and the
// cancel/submit action row - identical between the two pages apart from
// `mode`/`userId`/`onSubmit`/the action labels, which are the only pieces
// that actually differ between logging a new dive and editing an existing one.
export function DiveFormCard<TFieldValues extends DiveFormValues>({
  form,
  mixtureFieldArray,
  mode,
  userId,
  visibility,
  onSubmit,
  isSubmitting,
  cancelHref,
  submittingLabel,
  submitLabel,
  onFileAdded,
  pendingFiles,
  onRemovePendingFile,
  onDeleteStoredFile,
  recordings,
  diveUuid,
  knownDiveSites,
  knownGearItems,
  knownSpecies,
  diveNumberNotice,
}: DiveFormCardProps<TFieldValues>) {
  // Owned here rather than in `DiveFormFields` because the button that has to
  // wait for it is this component's, not that one's. A species picked but not
  // yet resolved is not in form state, so a save that beat the resolve would
  // write the dive without the sighting and say nothing about it.
  const [isResolvingSpecies, setIsResolvingSpecies] = useState(false);

  // The field a failed submit revealed, focused once it is actually on screen.
  // react-hook-form focuses the first errored field itself, but only one that is
  // mounted - and the whole point of this path is that it wasn't.
  //
  // A fresh object per request, so two failed submits on the same field both fire and
  // an unrelated later reveal - an import, a gear set - does not. The `setState` and
  // the `reveal` beside it are batched into one render, which is the render after
  // which the input exists.
  const [focusRequest, setFocusRequest] = useState<{
    key: DiveFormFieldKey;
  } | null>(null);
  const { isVisible, reveal } = visibility;
  useEffect(() => {
    if (!focusRequest) return;
    // A per-cylinder key names a column rather than an input, so there is no one
    // field to focus; the section being on screen is the whole of the fix there.
    if (focusRequest.key.includes(".")) return;
    form.setFocus(
      focusRequest.key as unknown as Parameters<typeof form.setFocus>[0],
    );
  }, [focusRequest, form]);

  // The resolver validates hidden fields too - react-hook-form's default
  // `shouldUnregister: false` keeps their values in form state - so without this a
  // hidden field carrying an error would block the save with no message anywhere on
  // the page, which is exactly the "the save button did nothing" shape DECISIONS.md
  // records.
  const handleInvalid = (errors: Record<string, unknown>) => {
    const keys = diveFormFieldsWithErrors(errors);
    if (keys.length === 0) return;
    const stillHidden = keys.filter((key) => !isVisible(key));
    if (stillHidden.length > 0) setFocusRequest({ key: stillHidden[0] });
    reveal(keys);
  };

  // The other half of the same defect, and the half nothing here could see.
  //
  // `handleInvalid` above covers a *resolver* rejection. The browser's own
  // constraint validation runs earlier than that and cancels the submit outright:
  // `handleSubmit` is never called, so neither callback fires and the dive form
  // has nothing to render. `noValidate` on the `<form>` below moves that decision
  // here, where the refusal can be both reported and shown.
  //
  // A value the diver never typed is what makes this reachable rather than
  // theoretical - an imported `avg_depth` of 2.70000029 is a `stepMismatch` the
  // moment the box declares a step, and the form would simply stop saving. The
  // steps themselves are fixed (see `UnitNumberInput`); this is here so the next
  // constraint that disagrees with the data says so instead of going quiet.
  const [blockedSubmit, setBlockedSubmit] = useState<string | null>(null);
  const submit = form.handleSubmit(onSubmit, handleInvalid);
  const handleSubmitEvent = (event: FormEvent<HTMLFormElement>) => {
    const element = event.currentTarget;
    const blocked = describeBlockedSubmit(element);
    setBlockedSubmit(blocked);
    if (blocked === null) return submit(event);

    event.preventDefault();
    // Unchanged where it already worked: this is what focuses the first refused
    // field and draws the browser's bubble over it. The message above is what
    // survives when it doesn't.
    element.reportValidity();
  };

  return (
    <Card>
      <CardHeader>
        {/* `relative` so the Fields control can be positioned into the title row
            without joining it: any flex or grid parent gets a say in the row's
            height, and this header has to be the same height with the control as
            without it. Same mechanism, same reason, as `EntryUnitLabelRow`. */}
        <div className="relative">
          <CardTitle as="h2">Dive Details</CardTitle>
          {/* Outside the `<form>` on purpose, menu and dialog both. Nothing in
              either is a form control of the dive, and a submit raised inside one -
              the Configure dialog's name prompt taking Enter - would otherwise reach
              `handleSubmit` through the React tree even when the DOM says it
              cannot. */}
          <DiveFormFieldsMenu visibility={visibility} userId={userId} />
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            // The browser no longer cancels this submit on its own - see
            // `handleSubmitEvent`, which asks it the same question and reports
            // the answer rather than leaving the diver with a dead button.
            noValidate
            onSubmit={handleSubmitEvent}
            className="space-y-6"
          >
            {/* Import from dive computer file */}
            <DiveFileImport
              form={form}
              replaceMixtures={mixtureFieldArray.replace}
              onFileAdded={onFileAdded}
              pending={pendingFiles}
              onRemovePending={onRemovePendingFile}
              onDeleteStored={onDeleteStoredFile}
              recordings={recordings}
              diveUuid={diveUuid}
              // One of the four moments a value arrives from outside the diver's
              // typing: whatever the file filled in is on screen, whether or not the
              // stored set hides it, and it counts as the diver's from here on.
              onValuesApplied={() =>
                visibility.revealNonEmpty(form.getValues())
              }
            />

            <DiveFormFields
              control={form.control}
              mode={mode}
              userId={userId}
              visibility={visibility}
              mixtureFieldArray={mixtureFieldArray}
              knownDiveSites={knownDiveSites}
              knownGearItems={knownGearItems}
              knownSpecies={knownSpecies}
              onSpeciesPendingChange={setIsResolvingSpecies}
              diveNumberNotice={diveNumberNotice}
            />

            {/* Above the buttons, so a refusal is on screen next to the control
                that produced it rather than off the top of a long form. */}
            <FormApiError error={blockedSubmit} />

            <DiveFormActions
              cancelHref={cancelHref}
              mode={mode}
              isSubmitting={isSubmitting}
              submittingLabel={submittingLabel}
              submitLabel={submitLabel}
              isBusy={isResolvingSpecies}
              busyLabel="Adding species..."
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
