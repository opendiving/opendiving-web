"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useReturnTo } from "@/hooks/useReturnTo";
import { withReturnTo } from "@/lib/return-to";
import { useSuggestedDiveNumber } from "@/hooks/useSuggestedDiveNumber";
import { divesAPI } from "@/lib/api/dives";
import { coursesAPI, type CourseLookupItem } from "@/lib/api/courses";
import { tripsAPI, type TripLookupItem } from "@/lib/api/trips";
import { mergePeople } from "@/lib/people";
import type { PersonReference } from "@/lib/api/people";
import {
  boatNameOrNull,
  diveCreateSchema,
  DiveCreateInput,
  normalizeMixtures,
} from "@/lib/validations/dive";
import { useMixtureFieldArray } from "@/components/dives/mixture-fields";
import { useDiveFormVisibility } from "@/hooks/useDiveFormVisibility";
import { useDiveSitePrefill } from "@/hooks/useDiveSitePrefill";
import { useDivePickPrefill } from "@/hooks/useDivePickPrefill";
import { DiveFormCard } from "@/components/dives/dive-form-card";
import { AutofilledMarks } from "@/components/dives/autofilled-marks";
import type { PendingDiveFile } from "@/components/dives/dive-recording-files";
import { PageHeader } from "@/components/ui/page-header";
import { PageSpinner } from "@/components/ui/page-spinner";
import { useToast } from "@/components/ui/use-toast";
import { nowStartTime, parseFormDuration } from "@/lib/date-time";
import { getApiErrorMessage } from "@/lib/api/error";

// Each "Log a dive" starts a new form from the last dive and whatever the URL
// names. The router keeps this route mounted under `<Activity>` after the diver
// leaves it, so without the key a later visit would show the earlier visit's form
// - a site's values on a dive logged for a trip, and the prefill giving up on the
// dirty form before the trip lands. `bfcacheId` changes on every push or replace
// but not on back/forward, which still restores the draft; it stays put across a
// search-param-only change, hence the parameters in the key.
export function NewDivePageContent() {
  const { bfcacheId } = useRouter();
  const searchParams = useSearchParams();
  return <NewDiveForm key={`${bfcacheId}?${searchParams.toString()}`} />;
}

function NewDiveForm() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The imported files are held here until the dive exists - `/dive/parse`
  // stores nothing, and there is no dive to attach them to until `onSubmit`
  // succeeds. A list rather than one file: a dive logged off two computers has
  // two recordings, and the same computer's JSON beside its FIT is two files of
  // one recording. The API decides which is which when each is attached.
  const [pendingFiles, setPendingFiles] = useState<PendingDiveFile[]>([]);
  // Whether the last-dive prefill below has landed, given up or failed - the
  // moment the primary site's values may be written over it.
  const [prefillSettled, setPrefillSettled] = useState(false);
  // What a course or trip picked later merges its people with.
  const [lastDivePeople, setLastDivePeople] = useState<PersonReference[]>([]);

  // Allow pre-selecting a trip/dive site/course via ?trip_uuid=... /
  // ?dive_site_uuid=... / ?course_uuid=..., e.g. when logging a dive from a
  // trip's, dive site's or course's detail page.
  const initialTripId = searchParams.get("trip_uuid") ?? undefined;
  const initialDiveSiteId = searchParams.get("dive_site_uuid") ?? undefined;
  const initialCourseId = searchParams.get("course_uuid") ?? undefined;

  // Back/Cancel return to wherever this form was opened from - the trip or dive
  // site being logged against, an explicit `?from=`, or the dive list.
  const returnTo = useReturnTo({ href: "/dives", label: "Back to dives" });

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
      // The selects' "Not recorded" and an empty box, for the same reason.
      type: "",
      rating: null,
      air_temperature: undefined,
      current: "",
      waves: "",
      weather: "",
      entry_type: "",
      boat_name: "",
      weight: undefined,
      trip_uuid: initialTripId,
      course_uuid: initialCourseId,
      contact_uuid: null,
      people: [],
      dive_site_uuids:
        initialDiveSiteId !== undefined ? [initialDiveSiteId] : [],
      gear_item_uuids: [],
      sightings: [],
      tags: [],
      notes: "",
      // Empty, not a seeded cylinder. A form must not write gas the diver never
      // entered: `DEFAULT_MIXTURE`'s 11.1 L of air is a plausible enough cylinder
      // (it is the "11.1 L (AL80)" preset in `volume-combobox.tsx`) that a diver who
      // never opened the gas card could not tell it from something they logged - and
      // `diveModWarning` would then raise a depth-safety warning derived from it. The
      // prefill below still carries the last dive's cylinders over, which is where
      // the convenience actually lives; "Add tank" still starts from
      // `DEFAULT_MIXTURE`.
      mixtures: [],
    },
  });
  const mixtureFieldArray = useMixtureFieldArray(form.control);
  // `fillsDefaults`, because this form has defaults to fill: showing a field the
  // diver had hidden gives it the last dive's value, and hiding an untouched one
  // empties it. The edit form passes false - what appears there on show is the
  // stored value, and hide/show never change form state.
  const visibility = useDiveFormVisibility({
    form,
    replaceMixtures: mixtureFieldArray.replace,
    fillsDefaults: true,
  });
  const { prefill, revealNonEmpty, autofill } = visibility;

  // The primary site's water type, altitude and entry type, once the last dive's
  // have landed: a site in the URL is a uuid at mount, its read races the last
  // dive's, and that prefill gives up on a dirty form - so whichever lands first,
  // the site's values are written second.
  useDiveSitePrefill({
    control: form.control,
    visibility,
    enabled: prefillSettled,
  });
  useDivePickPrefill({ form, visibility, lastDivePeople });

  // The moment a value arrives from outside the diver's typing at mount: a trip,
  // dive site or course a page passed in the URL. A diver who clicked "Log a dive
  // for this course" asked for that field, and Basic hides `course_uuid` - so
  // without this the click would file the dive against no course. Derived from the
  // values rather than from the three parameters, so the rule is the same one the
  // other moments use.
  useEffect(() => {
    revealNonEmpty(form.getValues());
    // Mount only. Its inputs are the `defaultValues` above, which are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The dive number tracks the start time (including a start time an imported
  // file rewrote), rather than being prefilled once from the last dive - see the
  // hook. It stops as soon as the diver edits the field themselves.
  const numberSuggestion = useSuggestedDiveNumber(
    form,
    Boolean(user),
    (before, after) => visibility.noteAutofill("dive_number", before, after),
  );

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
  //
  // **`user.uuid` is this effect's trigger, not an argument to it.** The request
  // below is scoped by the session, so the uuid is here only to say that a
  // signed-in account is known and which one it is. Depending on `user` itself
  // would add a second, false trigger: persisting a Fields toggle folds the new
  // hidden set into the auth context, which replaces that object, and flipping a
  // switch would re-run the prefill on a clean form - refetching the last dive
  // and re-stamping `start_time` with `nowStartTime()`. The invariant is that
  // persisting a toggle never resets the form, re-runs this effect or refetches
  // the last dive, and the uuid is what it rests on. Anything added here later
  // has to be a value, not an object.
  const userUuid = user?.uuid;
  useEffect(() => {
    if (!userUuid) return;

    let cancelled = false;

    // The course a page passed in the URL, whose contact ran the dive and whose
    // people were on it unless the diver says otherwise. Looked up beside the
    // last dive rather than after it, and non-fatal: a failed lookup leaves both
    // fields to the last dive, as though the course named nobody.
    const urlCourse = async (): Promise<CourseLookupItem | null> => {
      if (!initialCourseId) return null;
      try {
        const [course] = await coursesAPI.lookupCoursesByUuid([
          initialCourseId,
        ]);
        return course ?? null;
      } catch (error) {
        console.error("Failed to fetch the course:", error);
        return null;
      }
    };

    // The same for a trip a page passed in the URL, whose people came along.
    const urlTrip = async (): Promise<TripLookupItem | null> => {
      if (!initialTripId) return null;
      try {
        const [trip] = await tripsAPI.lookupTripsByUuid([initialTripId]);
        return trip ?? null;
      } catch (error) {
        console.error("Failed to fetch the trip:", error);
        return null;
      }
    };

    const prefillFromLastDive = async () => {
      try {
        const [response, course, trip] = await Promise.all([
          divesAPI.getDives(1, 1),
          urlCourse(),
          urlTrip(),
        ]);
        if (cancelled || form.formState.isDirty) return;
        const courseContact = course?.contact_uuid ?? null;
        // The people of whatever the dive is being logged for, ahead of the
        // last dive's.
        const urlPeople = mergePeople(course?.people ?? [], trip?.people ?? []);

        // The URL course's contact and the URL people are written through
        // `autofill` in both branches, rather than only carried. That records each
        // as the layer's write - so a course picked later can still replace the
        // contact - and it shows the field: `prefill` blanks a key the stored set
        // hides, and only the course or trip itself was revealed at mount, while
        // the diver who asked to log a dive for it asked for its people too.
        // Called only past the last of the dirty checks, since the write dirties
        // the form they read.
        const lastDiveSummary = response.data[0];
        if (!lastDiveSummary) {
          if (courseContact) autofill("contact_uuid", courseContact);
          if (urlPeople.length > 0) autofill("people", urlPeople);
          return;
        }

        // The list endpoint doesn't include gas mixtures or people (only the
        // single-dive endpoint does), so fetch the full record to prefill them.
        const lastDive = await divesAPI.getDive(lastDiveSummary.uuid);
        if (cancelled || form.formState.isDirty) return;

        // What the last dive (or a URL parameter) offers per key, written out once
        // and handed to the visibility layer twice: as part of the `reset` object
        // and as the carried map. A key that is on screen takes its value from
        // here; a key that is hidden takes its empty value instead and takes this
        // one the moment the diver shows it. That is owner decision 1 read forwards
        // and backwards at once, and the layer's record of what it wrote - not
        // react-hook-form's dirty state - is what "untouched" means afterwards.
        // URL param takes precedence over the last dive's course, as for the trip.
        const courseUuid = initialCourseId ?? lastDive.course_uuid ?? undefined;
        // Everyone on the last dive, whatever their role: the last dive is the
        // one source, and who stays on a course is the diver's to say. The URL
        // course's or trip's people lead.
        const people = mergePeople(urlPeople, lastDive.people ?? []);
        const carried: Partial<DiveCreateInput> = {
          // Carried over, unlike the temperature and visibility below: those are
          // readings taken on the day, while the water and its elevation are
          // properties of where the diver is - and a second dive is usually in
          // the same water at the same place. Same argument as the weight below.
          water_type: lastDive.water_type ?? "",
          altitude: lastDive.altitude,
          // Carried for the same reason: a trip's dives are the same kind of dive,
          // from the same boat or the same shore, dive after dive. The rating, the
          // tags and the day's conditions are not - see the reset below.
          type: lastDive.type ?? "",
          entry_type: lastDive.entry_type ?? "",
          boat_name: lastDive.boat_name ?? "",
          // Carried over for the same reason as the gear below: weight is a
          // property of the kit and exposure suit, so it rarely changes between
          // consecutive dives.
          weight: lastDive.weight,
          // URL param takes precedence over the last dive's trip.
          trip_uuid: initialTripId ?? lastDive.trip_uuid,
          // Carried like the trip: a course runs over several dives in a row. A
          // course page's "Log a dive for this course" arrives as
          // `initialCourseId`, already revealed at mount, so hiding `course_uuid`
          // never loses it.
          course_uuid: courseUuid,
          // Carried like the trip - a week with one shop is logged with it dive
          // after dive - and, like the trip, behind what the URL asked for: the
          // course's own contact comes first.
          contact_uuid: courseContact ?? lastDive.contact_uuid ?? null,
          // Carried like the dive center - see `people` above.
          people,
          dive_site_uuids:
            initialDiveSiteId !== undefined ? [initialDiveSiteId] : [],
          // Divers tend to use the same kit dive after dive, so carry it over.
          // Archived items are skipped: they're gear that's been retired since,
          // and the picker wouldn't offer them for a new dive either.
          gear_item_uuids: (lastDive.gear_items ?? [])
            .filter((item) => !item.is_archived)
            .map((item) => item.uuid),
          // Whatever the last dive recorded, and nothing when it recorded nothing -
          // a diver who logs gas gets it carried over, a diver who doesn't keeps an
          // empty card rather than acquiring a cylinder on dive two. See
          // `defaultValues` above.
          mixtures:
            lastDive.mixtures?.map((m) => ({
              // `?? ""` on all three, like `po2_limit` below and for the reason
              // recorded under "The API sends `null`, the form schema only understood
              // `""`" in DECISIONS.md: these are nullable on the wire now that a
              // cylinder may record a mix with no vessel, `null` is a member of no
              // field's union in `diveMixtureSchema`, and a `reset()` seeded with one
              // fails validation on a value the diver never entered - silently, since
              // `handleSubmit`'s valid callback simply never fires. A last dive
              // imported from a file that recorded no cylinder size carries that
              // absence forward rather than acquiring an 11.1 L on the way.
              volume: m.volume ?? ("" as const),
              oxygen: m.oxygen ?? ("" as const),
              helium: m.helium ?? ("" as const),
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
        };

        if (courseContact) autofill("contact_uuid", courseContact);
        if (urlPeople.length > 0) autofill("people", people);
        const seeded = prefill<DiveCreateInput>(
          {
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
            // The day's, like the temperature and visibility above: a new dive
            // gets its own air, current, waves and weather, and its own rating
            // and tags, which are the diver's word on this dive and no other.
            air_temperature: undefined,
            current: "",
            waves: "",
            weather: "",
            rating: null,
            tags: [],
            // Deliberately *not* carried over, unlike the gear above: gear is
            // habitual, sightings are observations. Copying yesterday's turtle
            // into today's dive would fabricate a record of seeing it. Listed
            // rather than omitted because this `reset` enumerates every field, and
            // a field left out of it comes back `undefined`.
            sightings: [],
            notes: "",
            // Spread so this object still enumerates every field, for the reason
            // directly above. `prefill` rewrites each of these keys against the
            // visibility rules, so the spread is the shape and the second argument
            // is the meaning.
            ...carried,
          },
          carried,
        );
        form.reset(seeded);
        setLastDivePeople(lastDive.people ?? []);
      } catch (error) {
        console.error("Failed to fetch last dive for pre-fill:", error);
      } finally {
        if (!cancelled) setPrefillSettled(true);
      }
    };

    prefillFromLastDive();

    return () => {
      cancelled = true;
    };
  }, [
    userUuid,
    form,
    prefill,
    autofill,
    initialTripId,
    initialDiveSiteId,
    initialCourseId,
  ]);

  if (isAuthLoading) {
    return <PageSpinner />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  const onSubmit = async (data: DiveCreateInput) => {
    try {
      setIsSubmitting(true);

      // Convert form data to API format
      const diveData = {
        ...data,
        duration: parseFormDuration(data.duration),
        notes: data.notes || "",
        // The picker clears to `null` so the *edit* form can tell "detach this
        // dive from its trip" apart from "field untouched" (see
        // `DiveUpdate.trip_uuid`). On create there is nothing to detach from,
        // so the two collapse back into one and the field is simply omitted.
        trip_uuid: data.trip_uuid ?? undefined,
        // Same collapse, same reason - see `trip_uuid` directly above.
        course_uuid: data.course_uuid ?? undefined,
        contact_uuid: data.contact_uuid ?? undefined,
        // The select's "Not recorded" option is `""`, which the API's enum would
        // reject. On the edit form it converts to an explicit `null` ("the diver
        // cleared this"); on create there is nothing to clear, so - exactly like
        // `trip_uuid` above - the field is simply omitted.
        water_type: data.water_type === "" ? undefined : data.water_type,
        // The same for the other selects and the boat name's box.
        type: data.type === "" ? undefined : data.type,
        current: data.current === "" ? undefined : data.current,
        waves: data.waves === "" ? undefined : data.waves,
        weather: data.weather === "" ? undefined : data.weather,
        entry_type: data.entry_type === "" ? undefined : data.entry_type,
        boat_name: boatNameOrNull(data.boat_name ?? "") ?? undefined,
        mixtures: normalizeMixtures(data.mixtures ?? []),
      };

      const created = await divesAPI.createDive(diveData);

      // In pick order, and one at a time rather than in parallel: the API
      // decides per file whether it joins a recording already on this dive or
      // starts a new one, and two attaches racing would make "the recording
      // this dive already has" depend on which request the server saw first.
      for (const item of pendingFiles) {
        try {
          await divesAPI.attachRecordingFile(
            created.uuid,
            item.file,
            item.token,
          );
        } catch (error) {
          // Deliberately non-fatal. The dive exists and is correct; keeping the
          // source file is a nicety for future parsing work, not something the
          // diver asked for. Rolling the dive back - or blocking the redirect -
          // to save it would be a far worse outcome than losing it, and it can
          // still be attached later from the edit page.
          //
          // The real failures surface here with the API's own wording: a 409
          // ("already attached to another dive", i.e. the same export logged
          // twice), a 422 (the import expired) and a 413 naming the storage
          // limit this file would cross. All are worth reading.
          console.error("Failed to attach the dive file:", error);
          toast({
            title: `Dive logged, but ${item.file.name} wasn't attached`,
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
      // after a successful save the thing worth seeing is the new record. Its
      // back link goes where the form's would have.
      router.push(withReturnTo(`/dives/${created.uuid}`, returnTo.href));
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
    <div className="container mx-auto px-4 pt-8 pb-6 max-w-2xl">
      <PageHeader
        backHref={returnTo.href}
        backLabel={returnTo.label}
        title="Log New Dive"
        subtitle="Record the details of your dive"
      />

      <AutofilledMarks
        control={form.control}
        isAutofilled={visibility.isAutofilled}
      >
        <DiveFormCard
          form={form}
          mixtureFieldArray={mixtureFieldArray}
          visibility={visibility}
          mode="create"
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          cancelHref={returnTo.href}
          submittingLabel="Logging dive..."
          submitLabel="Log dive"
          onFileAdded={(item) => setPendingFiles((files) => [...files, item])}
          pendingFiles={pendingFiles}
          onRemovePendingFile={(id) =>
            setPendingFiles((files) => files.filter((item) => item.id !== id))
          }
          diveNumberNotice={diveNumberNotice}
        />
      </AutofilledMarks>
    </div>
  );
}
