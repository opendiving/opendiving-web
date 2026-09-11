"use client";

import { Suspense, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useResource } from "@/hooks/useResource";
import { useReturnTo } from "@/hooks/useReturnTo";
import { divesAPI, Dive } from "@/lib/api/dives";
import type { PendingDiveFile } from "@/components/dives/dive-recording-files";
import {
  buildDiveUpdate,
  diveToFormValues,
  diveUpdateSchema,
  DiveUpdateInput,
} from "@/lib/validations/dive";
import { useMixtureFieldArray } from "@/components/dives/mixture-fields";
import { useDiveFormVisibility } from "@/hooks/useDiveFormVisibility";
import { DiveFormCard } from "@/components/dives/dive-form-card";
import { PageHeader } from "@/components/ui/page-header";
import { PageSpinner } from "@/components/ui/page-spinner";
import { FormPageSkeleton } from "@/components/ui/page-skeleton";
import { NotFoundState } from "@/components/ui/not-found-state";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api/error";

// `useReturnTo` reads the query string, which Next requires a Suspense boundary
// around - same wrapper the new-dive page uses.
export default function EditDivePage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <EditDivePageContent />
    </Suspense>
  );
}

function EditDivePageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Attached after the edit is saved rather than when the file is picked, so
  // that importing a file and then cancelling the edit doesn't silently change
  // what the dive holds. A list, for the reason the create page's is one: a dive
  // can gain a second computer's recording and a second file of an existing one
  // in the same edit.
  const [pendingFiles, setPendingFiles] = useState<PendingDiveFile[]>([]);

  const form = useForm<DiveUpdateInput>({
    resolver: zodResolver(diveUpdateSchema),
    defaultValues: {
      dive_number: undefined,
      start_time: "",
      duration: "",
      max_depth: undefined,
      avg_depth: undefined,
      bottom_temperature: undefined,
      visibility: undefined,
      // The select's "Not recorded" option, for the same reason as on the create
      // page: `undefined` is what react-hook-form re-displays a default for.
      water_type: "",
      altitude: undefined,
      weight: undefined,
      trip_uuid: undefined,
      course_uuid: undefined,
      dive_site_uuids: [],
      gear_item_uuids: [],
      notes: "",
      // Empty, and the same for the seed `diveToFormValues` overwrites this
      // with: the whole form is submitted on save, so a cylinder invented here
      // is a cylinder written to the dive. The create form starts empty too, on
      // its own grounds - see "The create form proposes no cylinder" in
      // DECISIONS.md.
      mixtures: [],
    },
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
  const { revealNonEmpty } = visibility;

  // Seeds the form from the loaded dive, and is the first of the four moments a
  // value arrives from outside the diver's typing: a dive that records notes shows
  // its notes even under a preset that hides them, because an edit form quietly
  // holding data the diver cannot see is the one thing this feature must not do.
  const resetFromDive = useCallback(
    (diveData: Dive) => {
      const values = diveToFormValues(diveData);
      form.reset(values);
      revealNonEmpty(values);
    },
    [form, revealNonEmpty],
  );

  const {
    id: diveId,
    resource: dive,
    setResource: setDive,
    isLoading: isLoadingDive,
  } = useResource<Dive>(divesAPI.getDive, {
    enabled: !!user,
    errorMessage: "Failed to load dive details. Please try again.",
    redirectTo: "/dives",
    onLoaded: resetFromDive,
  });

  // Deleting a stored file happens now, not on save: the file is already on the
  // server, so there is nothing for a save to confirm and nothing for Cancel to
  // undo. The dialog in `DiveRecordingFiles` is the confirmation.
  //
  // **Re-read and `setDive`, deliberately not `useResource`'s `refetch`.** That
  // one re-runs `onLoaded`, which here is `resetFromDive` - so a diver who had
  // retyped a depth and then removed a file would have watched the edit vanish.
  // What has to update is the file list, which reads `dive.recordings`, and the
  // server may well have changed more of it than the one row: the recording's
  // profile is re-derived from whatever files are left, the recording itself
  // goes when its last file does, and the dive's exposure readings follow the
  // primary. Predicting any of that here would be a second implementation of
  // rules that already have one.
  const deleteStoredFile = useCallback(
    async (fileUuid: string) => {
      if (!diveId) return;
      try {
        await divesAPI.deleteDiveFile(diveId, fileUuid);
        setDive(await divesAPI.getDive(diveId));
        toast({
          title: "File deleted",
          description: "The file was removed from this dive.",
        });
      } catch (error) {
        console.error("Failed to delete the dive file:", error);
        toast({
          title: "Error",
          description: getApiErrorMessage(
            error,
            "Failed to delete the file. Please try again.",
          ),
          variant: "destructive",
        });
      }
    },
    [diveId, setDive, toast],
  );

  // Back/Cancel return to wherever the edit was started from - the dive list, a
  // trip, an explicit `?from=` - falling back to the dive itself.
  const returnTo = useReturnTo({
    href: `/dives/${diveId}`,
    label: "Back to Dive",
  });

  const onSubmit = async (data: DiveUpdateInput) => {
    if (!user || !diveId) return;

    try {
      setIsSubmitting(true);

      const updateData = buildDiveUpdate(data);

      await divesAPI.updateDive(diveId, updateData);

      // Serially and in pick order, for the reason the create page gives: the
      // API decides per file which recording it joins, and racing two attaches
      // would make that depend on request arrival order.
      for (const item of pendingFiles) {
        try {
          await divesAPI.attachRecordingFile(diveId, item.file, item.token);
        } catch (error) {
          // Non-fatal, for the same reason as on the new-dive page: the edit
          // itself succeeded, and losing the attachment is a much smaller cost
          // than failing a save the diver already made.
          console.error("Failed to attach the dive file:", error);
          toast({
            title: `Dive updated, but ${item.file.name} wasn't attached`,
            description: getApiErrorMessage(
              error,
              "Try importing the file again.",
            ),
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Success",
        description: "Dive updated successfully!",
      });

      router.push(`/dives/${diveId}`);
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
    return <PageSpinner />;
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
        // date, duration, depths, temperature, site and trip all land above
        // the fold, and undersizing the placeholder puts the jump back.
        fields={8}
      />
    );
  }

  if (!dive) {
    return (
      <div className="container mx-auto px-4 py-8">
        <NotFoundState
          message="Dive not found."
          backHref="/dives"
          backLabel="Back to Dives"
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <PageHeader
        backHref={returnTo.href}
        backLabel={returnTo.label}
        title={`Edit Dive #${dive.dive_number}`}
        subtitle="Update the details of your dive"
      />

      <DiveFormCard
        form={form}
        mixtureFieldArray={mixtureFieldArray}
        visibility={visibility}
        mode="edit"
        userId={user?.uuid ?? ""}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        cancelHref={returnTo.href}
        submittingLabel="Saving..."
        submitLabel="Save Changes"
        onFileAdded={(item) => setPendingFiles((files) => [...files, item])}
        pendingFiles={pendingFiles}
        onRemovePendingFile={(id) =>
          setPendingFiles((files) => files.filter((item) => item.id !== id))
        }
        onDeleteStoredFile={deleteStoredFile}
        recordings={dive.recordings ?? []}
        diveUuid={dive.uuid}
        // The dive already carries its sites' names, so the picker doesn't have
        // to look them up again just to label the rows it starts out with.
        knownDiveSites={dive.dive_sites}
        knownGearItems={dive.gear_items}
        knownSpecies={dive.species}
      />
    </div>
  );
}
