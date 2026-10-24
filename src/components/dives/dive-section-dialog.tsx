"use client";

import { type FormEvent, useLayoutEffect, useRef, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";

import { divesAPI, type Dive } from "@/lib/api/dives";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  DIVE_FORM_FIELD_REGISTRY,
  diveFormFieldsWithErrors,
  holdsValue,
  isMixtureField,
  type DiveFormFieldGroup,
  type DiveFormValueFieldKey,
} from "@/lib/dive-form-fields";
import { describeBlockedSubmit } from "@/lib/form-validity";
import {
  buildDiveUpdate,
  diveToFormValues,
  diveUpdateSchema,
  type DiveUpdateInput,
} from "@/lib/validations/dive";
import { useDiveFormVisibility } from "@/hooks/useDiveFormVisibility";
import { DiveFormFields } from "@/components/dives/dive-form-fields";
import { AutofilledMarks } from "@/components/dives/autofilled-marks";
import { fetchedMarks } from "@/lib/dive-conditions";
import { diveTitleText } from "@/components/dives/dive-title";
import { useMixtureFieldArray } from "@/components/dives/mixture-fields";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { FormApiError } from "@/components/ui/form-api-error";
import { useToast } from "@/components/ui/use-toast";

/**
 * The dive form's sections a dive page card is edited through. Dive info has no
 * card - the hero carries it, and the Edit page edits it - and Import is the
 * Recordings card's, which `DiveImportDialog` edits.
 */
export type DiveCardSection = Exclude<
  DiveFormFieldGroup,
  "Import" | "Dive info"
>;

const NO_GROUPS: ReadonlySet<DiveFormFieldGroup> = new Set();
const NEVER_AUTOFILLED = () => false;

// The section's fields of the dive, cylinder columns aside: those are parts of
// `mixtures`, which is the field.
function sectionFields(section: DiveCardSection): DiveFormValueFieldKey[] {
  return DIVE_FORM_FIELD_REGISTRY.flatMap(({ key, group }) =>
    group === section && holdsValue(key) && !isMixtureField(key) ? [key] : [],
  );
}

export interface DiveSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dive: Dive;
  section: DiveCardSection;
  /** Called once the dive has saved, so the page can re-read it. */
  onSaved: () => void;
}

/**
 * One section of the dive form in a dialog, over the card it edits: the same
 * fields the Edit page shows under that heading, saved as a `PATCH` of that
 * section's fields alone.
 *
 * No state of its own - `DialogPortal` unmounts the content when the dialog
 * closes, so each open builds a fresh form from the dive on the page.
 */
export function DiveSectionDialog({
  open,
  onOpenChange,
  dive,
  section,
  onSaved,
}: DiveSectionDialogProps) {
  const panel = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={panel}
        className="sm:max-w-2xl"
        // The panel rather than the first field: on a phone a focused box raises
        // the keyboard over a dialog the diver has not read yet, and a combobox
        // would open its list. Radix's own fallback for a dialog with nothing
        // tabbable, so it is still announced and still traps focus.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          panel.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit {section}</DialogTitle>
          <DialogDescription>
            {diveTitleText(dive.dive_number, dive.dive_sites)}
          </DialogDescription>
        </DialogHeader>
        <DiveSectionForm
          dive={dive}
          section={section}
          onCancel={() => onOpenChange(false)}
          onSaved={() => {
            onSaved();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function DiveSectionForm({
  dive,
  section,
  onCancel,
  onSaved,
}: {
  dive: Dive;
  section: DiveCardSection;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [fields] = useState(() => sectionFields(section));
  // Seeded with the whole dive, which the pickers read - the start time bounds
  // what they rank, the sites lead the species - and validated and sent as the
  // section alone. The picked schema strips the rest from what it hands the
  // submit, so a stored value this dialog does not show can neither block the
  // save nor ride along with it.
  const form = useForm<DiveUpdateInput>({
    resolver: zodResolver(
      diveUpdateSchema.pick(
        Object.fromEntries(fields.map((key) => [key, true])) as Partial<
          Record<keyof typeof diveUpdateSchema.shape, true>
        >,
      ),
    ) as unknown as Resolver<DiveUpdateInput>,
    defaultValues: diveToFormValues(dive),
  });
  const mixtureFieldArray = useMixtureFieldArray(form.control);
  const visibility = useDiveFormVisibility({
    form,
    replaceMixtures: mixtureFieldArray.replace,
    fillsDefaults: false,
  });
  const { reveal, revealNonEmpty } = visibility;
  const [fetched] = useState(() => fetchedMarks(dive));

  // Every field of the section, hidden on the form or not: the diver opened this
  // card to edit it, and a field of it missing here would be missing from the one
  // place they looked. Cylinder columns follow the stored set, as they do on the
  // Edit page, unless the tanks hold a value in one. Before paint, so the dialog
  // does not open a field short.
  useLayoutEffect(() => {
    revealNonEmpty(form.getValues());
    reveal(fields);
  }, [form, fields, reveal, revealNonEmpty]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolvingSpecies, setIsResolvingSpecies] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const onSubmit = async (data: DiveUpdateInput) => {
    setIsSubmitting(true);
    setApiError(null);
    try {
      await divesAPI.updateDive(dive.uuid, buildDiveUpdate(data));
      toast({ title: "Success", description: "Dive updated successfully!" });
      onSaved();
    } catch (error) {
      console.error("Failed to update dive:", error);
      setApiError(
        getApiErrorMessage(error, "Failed to update dive. Please try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // A refused cylinder column hidden by the stored set comes on screen with its
  // error, as on the Edit page.
  const submit = form.handleSubmit(onSubmit, (errors) =>
    reveal(diveFormFieldsWithErrors(errors)),
  );
  // The browser's own constraint validation would cancel the submit before
  // `handleSubmit` runs and say nothing - see `DiveForm`.
  const handleSubmitEvent = (event: FormEvent<HTMLFormElement>) => {
    const blocked = describeBlockedSubmit(event.currentTarget);
    if (blocked === null) return submit(event);
    event.preventDefault();
    setApiError(blocked);
    event.currentTarget.reportValidity();
  };

  return (
    <AutofilledMarks
      control={form.control}
      // The fetched marks alone: the form's own carry a legend on the Edit page,
      // which this dialog has no room for.
      isAutofilled={NEVER_AUTOFILLED}
      fetched={fetched}
    >
      <Form {...form}>
        <form noValidate onSubmit={handleSubmitEvent} className="space-y-6">
          <DiveFormFields
            control={form.control}
            mode="edit"
            visibility={visibility}
            mixtureFieldArray={mixtureFieldArray}
            knownDiveSites={dive.dive_sites}
            knownGearItems={dive.gear_items}
            knownSpecies={dive.sightings}
            onSpeciesPendingChange={setIsResolvingSpecies}
            collapsedGroups={NO_GROUPS}
            onGroupOpenChange={() => {}}
            only={section}
          />

          <FormApiError error={apiError} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isResolvingSpecies}>
              {isSubmitting || isResolvingSpecies ? (
                <>
                  <ButtonSpinner className="mr-2" />
                  {isSubmitting ? "Saving..." : "Adding species..."}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </AutofilledMarks>
  );
}
