"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useResource } from "@/hooks/useResource";
import { useReturnTo } from "@/hooks/useReturnTo";
import { withReturnTo } from "@/lib/return-to";
import { divesAPI, Dive } from "@/lib/api/dives";
import {
  buildDiveUpdate,
  diveToFormValues,
  diveUpdateSchema,
  DiveUpdateInput,
  emptyDiveFormValues,
} from "@/lib/validations/dive";
import { useMixtureFieldArray } from "@/components/dives/mixture-fields";
import { usePendingDiveFiles } from "@/components/dives/use-pending-dive-files";
import { useDiveFormVisibility } from "@/hooks/useDiveFormVisibility";
import { useDiveConditionsFill } from "@/hooks/useDiveConditionsFill";
import { DiveForm } from "@/components/dives/dive-form";
import { fetchedMarks } from "@/lib/dive-conditions";
import { DiveFormFieldsMenu } from "@/components/dives/dive-form-fields-menu";
import { DiveIcon } from "@/components/logo";
import {
  FORM_BODY,
  FORM_COLUMN,
  PAGE_COLUMN,
  PlainHero,
} from "@/components/ui/map-hero";
import { PageSpinner } from "@/components/ui/page-spinner";
import { FormPageSkeleton } from "@/components/ui/page-skeleton";
import { NotFoundState } from "@/components/ui/not-found-state";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api/error";

export function EditDivePageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<DiveUpdateInput>({
    resolver: zodResolver(diveUpdateSchema),
    defaultValues: { ...emptyDiveFormValues(), start_time: "" },
  });
  const mixtureFieldArray = useMixtureFieldArray(form.control);
  // `fillsDefaults: false` - the edit form has no defaults to carry. What appears
  // when a field is shown is the stored value, and hiding it never changes form
  // state, which is react-hook-form's `shouldUnregister: false` doing all of the
  // work by itself.
  const visibility = useDiveFormVisibility({
    form,
    replaceMixtures: mixtureFieldArray.replace,
    fillsDefaults: false,
  });
  const { reveal, revealNonEmpty } = visibility;

  // Seeds the form from the loaded dive, and is one of the moments a value
  // arrives from outside the diver's typing: a dive that records notes shows
  // its notes even under a preset that hides them, because an edit form quietly
  // holding data the diver cannot see is the one thing this feature must not do.
  const resetFromDive = useCallback(
    (diveData: Dive) => {
      const values = diveToFormValues(diveData);
      form.reset(values);
      revealNonEmpty(values);
      // The import's section holds the dive's files, which can be struck off there.
      if ((diveData.recordings ?? []).length > 0) reveal(["file_import"]);
    },
    [form, reveal, revealNonEmpty],
  );

  const {
    id: diveId,
    resource: dive,
    isLoading: isLoadingDive,
  } = useResource<Dive>(divesAPI.getDive, {
    enabled: !!user,
    errorMessage: "Failed to load dive details. Please try again.",
    redirectTo: "/dives",
    onLoaded: resetFromDive,
  });
  const files = usePendingDiveFiles(dive?.recordings);
  // Where the save leaves the dive's entry fix: a file attached to a dive with no
  // recordings becomes its first, and writes its own fix over the stored one.
  const pendingFiles = files.fileList.pending;
  const savedPosition =
    (dive?.recordings ?? []).length === 0 && pendingFiles.length > 0
      ? (pendingFiles.find((file) => file.entry)?.entry ?? null)
      : dive?.entry_latitude != null && dive.entry_longitude != null
        ? { latitude: dive.entry_latitude, longitude: dive.entry_longitude }
        : null;
  const conditions = useDiveConditionsFill({
    form,
    visibility,
    enabled: !!dive,
    stored: dive ? fetchedMarks(dive) : undefined,
    fetchedOnOpen: dive?.conditions != null,
    position: savedPosition,
  });
  useDocumentTitle(
    dive ? `Edit Dive #${dive.dive_number}` : undefined,
    "Dives",
  );

  // Back/Cancel return to wherever the edit was started from - the dive list, a
  // trip, an explicit `?from=` - falling back to the dive itself.
  const returnTo = useReturnTo({
    href: `/dives/${diveId}`,
    label: "Back to dive",
  });

  const onSubmit = async (data: DiveUpdateInput) => {
    if (!user || !diveId) return;

    try {
      setIsSubmitting(true);

      const updateData = buildDiveUpdate(conditions.withhold(data));

      await divesAPI.updateDive(diveId, updateData);

      await files.save(diveId, { saved: "Dive updated, but " });

      toast({
        title: "Success",
        description: "Dive updated successfully!",
      });

      // The dive, with its back link going where the form's would have.
      router.push(withReturnTo(`/dives/${diveId}`, returnTo.href));
    } catch (error) {
      console.error("Failed to update dive:", error);

      const errorMessage = getApiErrorMessage(
        error,
        "Failed to update dive. Please try again.",
      );

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingDive) {
    return (
      <FormPageSkeleton
        backHref={returnTo.href}
        backLabel={returnTo.label}
        // The dive form's first card is deeper than the six-field default -
        // date, dive time, depths, temperature, site and trip all land above
        // the fold, and undersizing the placeholder puts the jump back.
        fields={8}
      />
    );
  }

  if (!dive) {
    return (
      <div className={PAGE_COLUMN}>
        <NotFoundState
          message="Dive not found."
          backHref="/dives"
          backLabel="Back to dives"
        />
      </div>
    );
  }

  return (
    <div>
      <PlainHero
        backHref={returnTo.href}
        backLabel={returnTo.label}
        icon={DiveIcon}
        title={`Edit Dive #${dive.dive_number}`}
        subtitle="Update the details of your dive"
        figures={[]}
        column={FORM_COLUMN}
        actions={<DiveFormFieldsMenu visibility={visibility} />}
      />

      <div className={FORM_BODY}>
        <DiveForm
          form={form}
          mixtureFieldArray={mixtureFieldArray}
          visibility={visibility}
          mode="edit"
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          cancelHref={returnTo.href}
          submittingLabel="Saving..."
          submitLabel="Save changes"
          fileList={files.fileList}
          recordings={dive.recordings ?? []}
          diveUuid={dive.uuid}
          // The dive already carries its sites' names, so the picker doesn't have
          // to look them up again just to label the rows it starts out with.
          knownDiveSites={dive.dive_sites}
          knownGearItems={dive.gear_items}
          knownSpecies={dive.sightings}
          fetched={conditions.marks}
        />
      </div>
    </div>
  );
}
