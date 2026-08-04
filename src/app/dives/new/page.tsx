"use client";

import { Suspense, useEffect, useState } from "react";
import { Control, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { divesAPI } from "@/lib/api/dives";
import {
  diveCreateSchema,
  DiveCreateInput,
  normalizeMixtures,
} from "@/lib/validations/dive";
import {
  DEFAULT_MIXTURE,
  getDefaultMixtureName,
} from "@/components/dives/mixture-fields";
import { DiveFormFields } from "@/components/dives/dive-form-fields";
import { DiveFileImport } from "@/components/dives/dive-file-import";
import { DiveFormActions } from "@/components/dives/dive-form-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";
import {
  formatDateTimeForForm,
  parseFormDateTime,
  parseFormDuration,
} from "@/lib/date-time";
import { getApiErrorMessage } from "@/lib/api/error";

export default function NewDivePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <NewDivePageContent />
    </Suspense>
  );
}

function NewDivePageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Allow pre-selecting a trip/dive site via ?trip_uuid=... / ?dive_site_uuid=...,
  // e.g. when logging a dive from a trip's or dive site's detail page.
  const initialTripId = searchParams.get("trip_uuid") ?? undefined;
  const initialDiveSiteId = searchParams.get("dive_site_uuid") ?? undefined;

  const form = useForm<DiveCreateInput>({
    resolver: zodResolver(diveCreateSchema),
    defaultValues: {
      dive_number: 1,
      start_time: formatDateTimeForForm(new Date()),
      duration: "",
      max_depth: undefined,
      avg_depth: undefined,
      bottom_temperature: undefined,
      visibility: undefined,
      trip_uuid: initialTripId,
      dive_site_uuids:
        initialDiveSiteId !== undefined ? [initialDiveSiteId] : [],
      notes: "",
      mixtures: [{ ...DEFAULT_MIXTURE, name: getDefaultMixtureName(0) }],
    },
  });

  // Redirect to signin if not authenticated, but only once the auth check has
  // actually finished — otherwise a page refresh always looks "unauthenticated"
  // for a moment and would incorrectly bounce the user away.
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // Pre-fill trip and gas mixture defaults from the most recent dive so the
  // user doesn't have to re-enter recurring values for every new log entry.
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
          start_time: formatDateTimeForForm(new Date()),
          duration: "",
          max_depth: undefined,
          avg_depth: undefined,
          bottom_temperature: undefined,
          visibility: undefined,
          // URL param takes precedence over the last dive's trip.
          trip_uuid: initialTripId ?? lastDive.trip_uuid,
          dive_site_uuids:
            initialDiveSiteId !== undefined ? [initialDiveSiteId] : [],
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
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
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
        start_time: parseFormDateTime(data.start_time).toISOString(),
        duration: parseFormDuration(data.duration),
        notes: data.notes || "",
        mixtures: normalizeMixtures(data.mixtures ?? []),
      };

      await divesAPI.createDive(diveData);

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
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dives">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dives
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Log New Dive</h1>
          <p className="text-muted-foreground mt-1">
            Record the details of your dive
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

              <DiveFormFields
                control={form.control as unknown as Control<any, any, any>}
                mode="create"
                userId={user?.uuid ?? ""}
              />

              <DiveFormActions
                cancelHref="/dives"
                isSubmitting={isSubmitting}
                submittingLabel="Logging Dive..."
                submitLabel="Log Dive"
              />
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
