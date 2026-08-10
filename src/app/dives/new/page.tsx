"use client";

import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { divesAPI } from "@/lib/api/dives";
import {
  diveCreateSchema,
  DiveCreateInput,
  normalizeMixtures,
} from "@/lib/validations/dive";
import {
  DEFAULT_MIXTURE,
  getDefaultMixtureName,
  useMixtureFieldArray,
} from "@/components/dives/mixture-fields";
import { DiveFormCard } from "@/components/dives/dive-form-card";
import { PageHeader } from "@/components/ui/page-header";
import { PageSpinner } from "@/components/ui/page-spinner";
import { useToast } from "@/components/ui/use-toast";
import { nowStartTime, parseFormDuration } from "@/lib/date-time";
import { getApiErrorMessage } from "@/lib/api/error";

export default function NewDivePage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NewDivePageContent />
    </Suspense>
  );
}

function NewDivePageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The imported file is held here until the dive exists - `/dive/parse` stores
  // nothing, and there is no dive to attach it to until `onSubmit` succeeds.
  const [sourceFile, setSourceFile] = useState<{
    file: File;
    token: string;
  } | null>(null);

  // Allow pre-selecting a trip/dive site via ?trip_uuid=... / ?dive_site_uuid=...,
  // e.g. when logging a dive from a trip's or dive site's detail page.
  const initialTripId = searchParams.get("trip_uuid") ?? undefined;
  const initialDiveSiteId = searchParams.get("dive_site_uuid") ?? undefined;

  const form = useForm<DiveCreateInput>({
    resolver: zodResolver(diveCreateSchema),
    defaultValues: {
      dive_number: 1,
      start_time: nowStartTime(),
      duration: "",
      max_depth: undefined,
      avg_depth: undefined,
      bottom_temperature: undefined,
      visibility: undefined,
      weight: undefined,
      trip_uuid: initialTripId,
      dive_site_uuids:
        initialDiveSiteId !== undefined ? [initialDiveSiteId] : [],
      gear_item_uuids: [],
      notes: "",
      mixtures: [{ ...DEFAULT_MIXTURE, name: getDefaultMixtureName(0) }],
    },
  });
  const mixtureFieldArray = useMixtureFieldArray(form.control);

  // Pre-fill trip, gas mixture and gear defaults from the most recent dive so
  // the user doesn't have to re-enter recurring values for every new log entry.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const prefillFromLastDive = async () => {
      try {
        const response = await divesAPI.getDives(user.uuid, 1, 1);
        if (cancelled || form.formState.isDirty) return;

        const lastDiveSummary = response.data[0];
        if (!lastDiveSummary) return;

        // The list endpoint doesn't include gas mixtures (only the single-dive
        // endpoint does), so fetch the full record to prefill them.
        const lastDive = await divesAPI.getDive(lastDiveSummary.uuid);
        if (cancelled || form.formState.isDirty) return;

        form.reset({
          dive_number: lastDive.dive_number + 1,
          start_time: nowStartTime(),
          duration: "",
          max_depth: undefined,
          avg_depth: undefined,
          bottom_temperature: undefined,
          visibility: undefined,
          // Carried over for the same reason as the gear below: weight is a
          // property of the kit and exposure suit, so it rarely changes between
          // consecutive dives.
          weight: lastDive.weight,
          // URL param takes precedence over the last dive's trip.
          trip_uuid: initialTripId ?? lastDive.trip_uuid,
          dive_site_uuids:
            initialDiveSiteId !== undefined ? [initialDiveSiteId] : [],
          // Divers tend to use the same kit dive after dive, so carry it over.
          // Archived items are skipped: they're gear that's been retired since,
          // and the picker wouldn't offer them for a new dive either.
          gear_item_uuids: (lastDive.gear_items ?? [])
            .filter((item) => !item.is_archived)
            .map((item) => item.uuid),
          notes: "",
          mixtures: lastDive.mixtures?.length
            ? lastDive.mixtures.map((m, i) => ({
                name: m.name ?? getDefaultMixtureName(i),
                volume: m.volume,
                oxygen: m.oxygen,
                helium: m.helium,
                start_pressure: "" as const,
                end_pressure: "" as const,
              }))
            : [{ ...DEFAULT_MIXTURE, name: getDefaultMixtureName(0) }],
        });
      } catch (error) {
        console.error("Failed to fetch last dive for pre-fill:", error);
      }
    };

    prefillFromLastDive();

    return () => {
      cancelled = true;
    };
  }, [user, form, initialTripId, initialDiveSiteId]);

  if (isAuthLoading) {
    return <PageSpinner />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  const onSubmit = async (data: DiveCreateInput) => {
    if (!user) return;

    try {
      setIsSubmitting(true);

      // Convert form data to API format
      const diveData = {
        ...data,
        user_uuid: user.uuid,
        duration: parseFormDuration(data.duration),
        notes: data.notes || "",
        mixtures: normalizeMixtures(data.mixtures ?? []),
      };

      const created = await divesAPI.createDive(diveData);

      if (sourceFile) {
        try {
          await divesAPI.uploadDiveFile(
            created.uuid,
            sourceFile.file,
            sourceFile.token,
          );
        } catch (error: any) {
          // Deliberately non-fatal. The dive exists and is correct; keeping the
          // source file is a nicety for future parsing work, not something the
          // diver asked for. Rolling the dive back - or blocking the redirect -
          // to save it would be a far worse outcome than losing it, and it can
          // still be attached later from the edit page.
          //
          // Both real failures surface here with the API's own wording: a 409
          // ("already attached to another dive", i.e. the same export logged
          // twice) and a 422 (the import expired). Both are worth reading.
          console.error("Failed to attach the dive file:", error);
          toast({
            title: "Dive logged, but the file wasn't attached",
            description: getApiErrorMessage(
              error,
              "You can attach it from the dive's edit page.",
            ),
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Success",
        description: "Dive logged successfully!",
      });

      router.push("/dives");
    } catch (error: any) {
      console.error("Failed to create dive:", error);

      const errorMessage = getApiErrorMessage(
        error,
        "Failed to log dive. Please try again.",
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <PageHeader
        backHref="/dives"
        backLabel="Back to Dives"
        title="Log New Dive"
        subtitle="Record the details of your dive"
      />

      <DiveFormCard
        form={form}
        mixtureFieldArray={mixtureFieldArray}
        mode="create"
        userId={user?.uuid ?? ""}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        cancelHref="/dives"
        submittingLabel="Logging Dive..."
        submitLabel="Log Dive"
        onFileSelected={(file, token) => setSourceFile({ file, token })}
      />
    </div>
  );
}
