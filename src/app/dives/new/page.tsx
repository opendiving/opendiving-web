"use client";

import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useReturnTo } from "@/hooks/useReturnTo";
import { useSuggestedDiveNumber } from "@/hooks/useSuggestedDiveNumber";
import { divesAPI } from "@/lib/api/dives";
import {
  diveCreateSchema,
  DiveCreateInput,
  normalizeMixtures,
} from "@/lib/validations/dive";
import { useMixtureFieldArray } from "@/components/dives/mixture-fields";
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

  // Allow pre-selecting a trip/dive site/course via ?trip_uuid=... /
  // ?dive_site_uuid=... / ?course_uuid=..., e.g. when logging a dive from a
  // trip's, dive site's or course's detail page.
  const initialTripId = searchParams.get("trip_uuid") ?? undefined;
  const initialDiveSiteId = searchParams.get("dive_site_uuid") ?? undefined;
  const initialCourseId = searchParams.get("course_uuid") ?? undefined;

  // Back/Cancel return to wherever this form was opened from - the trip or dive
  // site being logged against, an explicit `?from=`, or the dive list.
  const returnTo = useReturnTo({ href: "/dives", label: "Back to Dives" });

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
      // `""`, not `undefined`: it is the select's "Not recorded" option, and the
      // default the field falls back to whenever its value resolves to
      // `undefined` - so it has to be the empty state rather than a gap.
      water_type: "",
      altitude: undefined,
      weight: undefined,
      trip_uuid: initialTripId,
      course_uuid: initialCourseId,
      dive_site_uuids:
        initialDiveSiteId !== undefined ? [initialDiveSiteId] : [],
      gear_item_uuids: [],
      species_uuids: [],
      notes: "",
      // Empty, not a seeded cylinder. A form must not write gas the diver never
      // entered: `DEFAULT_MIXTURE`'s 11.1 L of air is a plausible enough cylinder
      // (it is the "11.1 L (S80)" preset in `volume-combobox.tsx`) that a diver who
      // never opened the gas card could not tell it from something they logged - and
      // `diveModWarning` would then raise a depth-safety warning derived from it. The
      // prefill below still carries the last dive's cylinders over, which is where
      // the convenience actually lives; "Add Mixture" still starts from
      // `DEFAULT_MIXTURE`.
      mixtures: [],
    },
  });
  const mixtureFieldArray = useMixtureFieldArray(form.control);

  // The dive number tracks the start time (including a start time an imported
  // file rewrote), rather than being prefilled once from the last dive - see the
  // hook. It stops as soon as the diver edits the field themselves.
  const numberSuggestion = useSuggestedDiveNumber(form, Boolean(user));

  // Attached to the suggested value rather than rendered outright: the field
  // stops showing that number the moment the diver types their own, and a note
  // about a number that isn't on screen would be worse than no note. The field
  // itself does the comparison - see `DiveFormFields`.
  const diveNumberNotice = numberSuggestion?.is_taken
    ? {
        forValue: numberSuggestion.dive_number,
        message:
          `Another dive is already numbered #${numberSuggestion.dive_number}. ` +
          "That's expected while back-filling a log - you can tidy the " +
          "numbering from the dive list once everything is in.",
      }
    : null;

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
          // Kept, not recomputed: `useSuggestedDiveNumber` owns this field and
          // may already have filled it in by the time this prefill lands. The
          // two run concurrently, and whichever finishes second must not undo
          // the other - hence reading the current value back rather than
          // deriving one from `lastDive`, which would also be the wrong number
          // for a back-dated dive.
          dive_number: form.getValues("dive_number"),
          start_time: nowStartTime(),
          duration: "",
          max_depth: undefined,
          avg_depth: undefined,
          bottom_temperature: undefined,
          visibility: undefined,
          // Carried over, unlike the temperature and visibility above: those are
          // readings taken on the day, while the water and its elevation are
          // properties of where the diver is - and a second dive is usually in
          // the same water at the same place. Same argument as the weight below.
          water_type: lastDive.water_type ?? "",
          altitude: lastDive.altitude,
          // Carried over for the same reason as the gear below: weight is a
          // property of the kit and exposure suit, so it rarely changes between
          // consecutive dives.
          weight: lastDive.weight,
          // URL param takes precedence over the last dive's trip.
          trip_uuid: initialTripId ?? lastDive.trip_uuid,
          // Deliberately *not* inherited from the last dive, unlike the trip
          // above: a course ends, and silently tagging the first fun dive after
          // it as training is a worse default than one extra pick. The mid-course
          // streak is covered by the course page's own "Log a Dive for this
          // Course", which arrives here as `initialCourseId`.
          course_uuid: initialCourseId,
          dive_site_uuids:
            initialDiveSiteId !== undefined ? [initialDiveSiteId] : [],
          // Divers tend to use the same kit dive after dive, so carry it over.
          // Archived items are skipped: they're gear that's been retired since,
          // and the picker wouldn't offer them for a new dive either.
          gear_item_uuids: (lastDive.gear_items ?? [])
            .filter((item) => !item.is_archived)
            .map((item) => item.uuid),
          // Deliberately *not* carried over, unlike the gear above: gear is
          // habitual, sightings are observations. Copying yesterday's turtle
          // into today's dive would fabricate a record of seeing it. Listed
          // rather than omitted because this `reset` enumerates every field, and
          // a field left out of it comes back `undefined`.
          species_uuids: [],
          notes: "",
          // Whatever the last dive recorded, and nothing when it recorded nothing -
          // a diver who logs gas gets it carried over, a diver who doesn't keeps an
          // empty card rather than acquiring a cylinder on dive two. See
          // `defaultValues` above.
          mixtures:
            lastDive.mixtures?.map((m) => ({
              volume: m.volume,
              oxygen: m.oxygen,
              helium: m.helium,
              // Same reasoning as the gas fractions above - a diver on the same
              // 32/1.4 back gas and EAN50/1.6 deco bottle plans them the same way
              // dive after dive. `gas_number` is deliberately *not* carried: it
              // identifies a cylinder inside the previous dive's export file, and
              // this dive has no file for it to point into.
              po2_limit: m.po2_limit ?? ("" as const),
              role: m.role ?? ("" as const),
              // Carried for the same reason, and it is the field the carry-over
              // helps most: a sidemount diver's next dive is sidemount, and no
              // import will ever fill this in for them. Re-flagging both
              // cylinders by hand every dive is exactly the friction that would
              // stop the flag being used at all.
              usage: m.usage ?? ("" as const),
              start_pressure: "" as const,
              end_pressure: "" as const,
            })) ?? [],
        });
      } catch (error) {
        console.error("Failed to fetch last dive for pre-fill:", error);
      }
    };

    prefillFromLastDive();

    return () => {
      cancelled = true;
    };
  }, [user, form, initialTripId, initialDiveSiteId, initialCourseId]);

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
        // The picker clears to `null` so the *edit* form can tell "detach this
        // dive from its trip" apart from "field untouched" (see
        // `DiveUpdate.trip_uuid`). On create there is nothing to detach from,
        // so the two collapse back into one and the field is simply omitted.
        trip_uuid: data.trip_uuid ?? undefined,
        // Same collapse, same reason - see `trip_uuid` directly above.
        course_uuid: data.course_uuid ?? undefined,
        // The select's "Not recorded" option is `""`, which the API's enum would
        // reject. On the edit form it converts to an explicit `null` ("the diver
        // cleared this"); on create there is nothing to clear, so - exactly like
        // `trip_uuid` above - the field is simply omitted.
        water_type: data.water_type === "" ? undefined : data.water_type,
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
        } catch (error) {
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

      // The dive that was just logged, not wherever the form was opened from:
      // after a successful save the thing worth seeing is the new record.
      router.push(`/dives/${created.uuid}`);
    } catch (error) {
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
        backHref={returnTo.href}
        backLabel={returnTo.label}
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
        cancelHref={returnTo.href}
        submittingLabel="Logging Dive..."
        submitLabel="Log Dive"
        onFileSelected={(file, token) => setSourceFile({ file, token })}
        diveNumberNotice={diveNumberNotice}
      />
    </div>
  );
}
