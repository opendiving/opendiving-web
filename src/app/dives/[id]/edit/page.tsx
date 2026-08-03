"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { divesAPI, Dive } from "@/lib/api/dives";
import { diveUpdateSchema, DiveUpdateInput, normalizeMixtures } from "@/lib/validations/dive";
import { DEFAULT_MIXTURE, getDefaultMixtureName } from "@/components/dives/mixture-fields";
import { DiveFormFields } from "@/components/dives/dive-form-fields";
import { DiveFileImport } from "@/components/dives/dive-file-import";
import { DiveFormActions } from "@/components/dives/dive-form-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";
import { formatDateTimeForForm, parseFormDateTime, formatDurationForForm, parseFormDuration } from "@/lib/date-time";
import { getApiErrorMessage } from "@/lib/api/error";

export default function EditDivePage() {
  const params = useParams();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [dive, setDive] = useState<Dive | null>(null);
  const [isLoadingDive, setIsLoadingDive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const diveId = parseInt(params.id as string);

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
      trip_id: undefined,
      dive_site_ids: [],
      notes: "",
      mixtures: [{ ...DEFAULT_MIXTURE, name: getDefaultMixtureName(0) }],
    },
  });

  // Redirect to signin if not authenticated, but only once the auth check
  // has actually finished.
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/signin');
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // Fetch dive details and populate form
  useEffect(() => {
    const fetchDive = async () => {
      if (!user?.username || !diveId) return;

      try {
        setIsLoadingDive(true);
        const diveData = await divesAPI.getDive(user.username, diveId);
        setDive(diveData);

        // Update form with dive data
        form.reset({
          dive_number: diveData.dive_number,
          start_time: formatDateTimeForForm(new Date(diveData.start_time)),
          duration: formatDurationForForm(diveData.duration),
          max_depth: diveData.max_depth,
          avg_depth: diveData.avg_depth,
          bottom_temperature: diveData.bottom_temperature,
          visibility: diveData.visibility,
          trip_id: diveData.trip_id,
          dive_site_ids: diveData.dive_sites?.map((site) => site.id) ?? [],
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
        console.error('Failed to fetch dive:', error);
        toast({
          title: "Error",
          description: "Failed to load dive details. Please try again.",
          variant: "destructive",
        });
        router.push('/dives');
      } finally {
        setIsLoadingDive(false);
      }
    };

    if (user?.username) {
      fetchDive();
    }
  }, [user?.username, diveId, form, toast, router]);

  const onSubmit = async (data: DiveUpdateInput) => {
    if (!user?.username || !diveId) return;

    try {
      setIsSubmitting(true);

      // Filter out undefined values and format dates
      const updateData: any = {};

      if (data.dive_number !== undefined) {
        updateData.dive_number = data.dive_number;
      }

      if (data.start_time) {
        updateData.start_time = parseFormDateTime(data.start_time).toISOString();
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

      if (data.trip_id !== undefined) {
        updateData.trip_id = data.trip_id;
      }

      if (data.dive_site_ids !== undefined) {
        updateData.dive_site_ids = data.dive_site_ids;
      }

      if (data.notes !== undefined) {
        updateData.notes = data.notes;
      }

      if (data.mixtures !== undefined) {
        updateData.mixtures = normalizeMixtures(data.mixtures);
      }

      await divesAPI.updateDive(user.username, diveId, updateData);

      toast({
        title: "Success",
        description: "Dive updated successfully!",
      });

      router.push(`/dives/${diveId}`);
    } catch (error: any) {
      console.error('Failed to update dive:', error);

      const errorMessage = getApiErrorMessage(error, "Failed to update dive. Please try again.");

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
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingDive) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!dive) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="text-muted-foreground mb-4">
            Dive not found.
          </div>
          <Button asChild>
            <Link href="/dives">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dives
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/dives/${diveId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dive
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Edit Dive #{dive.dive_number}</h1>
          <p className="text-muted-foreground mt-1">
            Update the details of your dive
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dive Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Import from dive computer file */}
              <DiveFileImport form={form} />

              <DiveFormFields control={form.control} mode="edit" username={user?.username ?? ""} />

              <DiveFormActions
                cancelHref={`/dives/${diveId}`}
                isSubmitting={isSubmitting}
                submittingLabel="Updating Dive..."
                submitLabel="Update Dive"
              />
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
