"use client";

import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { DiveFileImport } from "@/components/dives/dive-file-import";
import {
  DiveFormFields,
  DiveFormValues,
} from "@/components/dives/dive-form-fields";
import { DiveFormActions } from "@/components/dives/dive-form-actions";
import { MixtureFieldArray } from "@/components/dives/mixture-fields";
import { DiveFileInfo, DiveSiteSummary } from "@/lib/api/dives";
import { GearItemSummary } from "@/lib/api/gear";
import { SpeciesSummary } from "@/lib/api/species";

export interface DiveFormCardProps<TFieldValues extends DiveFormValues> {
  form: UseFormReturn<TFieldValues>;
  mixtureFieldArray: MixtureFieldArray;
  mode: "create" | "edit";
  userId: string;
  onSubmit: (data: TFieldValues) => void | Promise<void>;
  isSubmitting: boolean;
  cancelHref: string;
  submittingLabel: string;
  submitLabel: string;
  // Passed straight through to `DiveFileImport`. The page, not this card, owns
  // the picked file: it can only be uploaded once the dive exists, which is
  // after `onSubmit` resolves.
  onFileSelected?: (file: File, fileToken: string) => void;
  attachedFile?: DiveFileInfo | null;
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
  onSubmit,
  isSubmitting,
  cancelHref,
  submittingLabel,
  submitLabel,
  onFileSelected,
  attachedFile,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Dive Details</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Import from dive computer file */}
            <DiveFileImport
              form={form}
              replaceMixtures={mixtureFieldArray.replace}
              onFileSelected={onFileSelected}
              attachedFile={attachedFile}
            />

            <DiveFormFields
              control={form.control}
              mode={mode}
              userId={userId}
              mixtureFieldArray={mixtureFieldArray}
              knownDiveSites={knownDiveSites}
              knownGearItems={knownGearItems}
              knownSpecies={knownSpecies}
              onSpeciesPendingChange={setIsResolvingSpecies}
              diveNumberNotice={diveNumberNotice}
            />

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
