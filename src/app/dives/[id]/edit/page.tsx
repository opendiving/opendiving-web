"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { divesAPI, Dive } from "@/lib/api/dives";
import {
  diveUpdateSchema,
  DiveUpdateInput,
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
import { SectionSpinner } from "@/components/ui/section-spinner";
import { NotFoundState } from "@/components/ui/not-found-state";
import { useToast } from "@/components/ui/use-toast";
import { formatDurationForForm, parseFormDuration } from "@/lib/date-time";
import { getApiErrorMessage } from "@/lib/api/error";

export default function EditDivePage() {
  const params = useParams();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const router = useRouter();
  const { toast } = useToast();
  const [dive, setDive] = useState<Dive | null>(null);
  const [isLoadingDive, setIsLoadingDive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const diveId = params.id as string;

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

  // Fetch dive details and populate form
  useEffect(() => {
    const fetchDive = async () => {
      if (!user || !diveId) return;

      try {
        setIsLoadingDive(true);
        const diveData = await divesAPI.getDive(diveId);
        setDive(diveData);

        // Update form with dive data. `start_time` is already the same
        // offset-aware shape the form's `DiveStartTimeField` edits, so it
        // carries straight over - no conversion needed.
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
          mixtures: diveData.mixtures?.length
            ? diveData.mixtures.map((m) => ({
                ...m,
                start_pressure: m.start_pressure ?? "",
                end_pressure: m.end_pressure ?? "",
              }))
            : [{ ...DEFAULT_MIXTURE, name: getDefaultMixtureName(0) }],
        });
      } catch (error) {
        console.error("Failed to fetch dive:", error);
        toast({
          title: "Error",
          description: "Failed to load dive details. Please try again.",
          variant: "destructive",
        });
        router.push("/dives");
      } finally {
        setIsLoadingDive(false);
      }
    };

    if (user) {
      fetchDive();
    }
  }, [user, diveId, form, toast, router]);

  const onSubmit = async (data: DiveUpdateInput) => {
    if (!user || !diveId) return;

    try {
      setIsSubmitting(true);

      // Filter out undefined values and format dates
      const updateData: any = {};

      if (data.dive_number !== undefined) {
        updateData.dive_number = data.dive_number;
      }

      if (data.start_time) {
        updateData.start_time = data.start_time;
      }

      if (data.duration) {
        updateData.duration = parseFormDuration(data.duration);
      }

      if (data.max_depth !== undefined) {
        updateData.max_depth = data.max_depth;
      }

      if (data.avg_depth !== undefined) {
        updateData.avg_depth = data.avg_depth;
      }

      if (data.bottom_temperature !== undefined) {
        updateData.bottom_temperature = data.bottom_temperature;
      }

      if (data.visibility !== undefined) {
        updateData.visibility = data.visibility;
      }

      if (data.weight !== undefined) {
        updateData.weight = data.weight;
      }

      if (data.trip_uuid !== undefined) {
        updateData.trip_uuid = data.trip_uuid;
      }

      if (data.dive_site_uuids !== undefined) {
        updateData.dive_site_uuids = data.dive_site_uuids;
      }

      if (data.gear_item_uuids !== undefined) {
        updateData.gear_item_uuids = data.gear_item_uuids;
      }

      if (data.notes !== undefined) {
        updateData.notes = data.notes;
      }

      if (data.mixtures !== undefined) {
        updateData.mixtures = normalizeMixtures(data.mixtures);
      }

      await divesAPI.updateDive(diveId, updateData);

      toast({
        title: "Success",
        description: "Dive updated successfully!",
      });

      router.push(`/dives/${diveId}`);
    } catch (error: any) {
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
        backHref={`/dives/${diveId}`}
        backLabel="Back to Dive"
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
        cancelHref={`/dives/${diveId}`}
        submittingLabel="Updating Dive..."
        submitLabel="Update Dive"
      />
    </div>
  );
}
