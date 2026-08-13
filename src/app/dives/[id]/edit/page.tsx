"use client";

import { Suspense, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useResource } from "@/hooks/useResource";
import { useReturnTo } from "@/hooks/useReturnTo";
import { divesAPI, Dive } from "@/lib/api/dives";
import {
  buildDiveUpdate,
  diveUpdateSchema,
  DiveUpdateInput,
  toDiveMixtureInput,
} from "@/lib/validations/dive";
import {
  DEFAULT_MIXTURE,
  getDefaultMixtureName,
  useMixtureFieldArray,
} from "@/components/dives/mixture-fields";
import { DiveFormCard } from "@/components/dives/dive-form-card";
import { PageHeader } from "@/components/ui/page-header";
import { PageSpinner } from "@/components/ui/page-spinner";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { NotFoundState } from "@/components/ui/not-found-state";
import { useToast } from "@/components/ui/use-toast";
import { formatDurationForForm } from "@/lib/date-time";
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
  // Uploaded after the edit is saved rather than when the file is picked, so
  // that importing a file and then cancelling the edit doesn't silently change
  // the dive's stored export.
  const [sourceFile, setSourceFile] = useState<{
    file: File;
    token: string;
  } | null>(null);

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
      weight: undefined,
      trip_uuid: undefined,
      dive_site_uuids: [],
      gear_item_uuids: [],
      notes: "",
      mixtures: [{ ...DEFAULT_MIXTURE, name: getDefaultMixtureName(0) }],
    },
  });
  const mixtureFieldArray = useMixtureFieldArray(form.control);

  // Seeds the form from the loaded dive. `start_time` is already the same
  // offset-aware shape the form's `DiveStartTimeField` edits, so it carries
  // straight over - no conversion needed.
  const resetFromDive = useCallback(
    (diveData: Dive) => {
      form.reset({
        dive_number: diveData.dive_number,
        start_time: diveData.start_time,
        duration: formatDurationForForm(diveData.duration),
        max_depth: diveData.max_depth,
        avg_depth: diveData.avg_depth,
        bottom_temperature: diveData.bottom_temperature,
        visibility: diveData.visibility,
        weight: diveData.weight,
        trip_uuid: diveData.trip_uuid,
        dive_site_uuids: diveData.dive_sites?.map((site) => site.uuid) ?? [],
        gear_item_uuids: diveData.gear_items?.map((item) => item.uuid) ?? [],
        notes: diveData.notes || "",
        // Converted field by field rather than spread: every optional field
        // arrives as an explicit `null` when the mixture doesn't record it, and
        // `null` satisfies none of their unions in `diveMixtureSchema`. See
        // `toDiveMixtureInput`.
        mixtures: diveData.mixtures?.length
          ? diveData.mixtures.map(toDiveMixtureInput)
          : [{ ...DEFAULT_MIXTURE, name: getDefaultMixtureName(0) }],
      });
    },
    [form],
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

      if (sourceFile) {
        try {
          await divesAPI.uploadDiveFile(
            diveId,
            sourceFile.file,
            sourceFile.token,
          );
        } catch (error) {
          // Non-fatal, for the same reason as on the new-dive page: the edit
          // itself succeeded, and losing the attachment is a much smaller cost
          // than failing a save the diver already made.
          console.error("Failed to attach the dive file:", error);
          toast({
            title: "Dive updated, but the file wasn't attached",
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
      <div className="container mx-auto px-4 py-8">
        <SectionSpinner />
      </div>
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
        mode="edit"
        userId={user?.uuid ?? ""}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        cancelHref={returnTo.href}
        submittingLabel="Saving..."
        submitLabel="Save Changes"
        onFileSelected={(file, token) => setSourceFile({ file, token })}
        attachedFile={dive.source_file}
        // The dive already carries its sites' names, so the picker doesn't have
        // to look them up again just to label the rows it starts out with.
        knownDiveSites={dive.dive_sites}
        knownGearItems={dive.gear_items}
      />
    </div>
  );
}
