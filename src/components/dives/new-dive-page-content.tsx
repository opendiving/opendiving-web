"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useReturnTo } from "@/hooks/useReturnTo";
import { withReturnTo } from "@/lib/return-to";
import { useSuggestedDiveNumber } from "@/hooks/useSuggestedDiveNumber";
import { divesAPI } from "@/lib/api/dives";
import { diveDraftsAPI } from "@/lib/api/dive-drafts";
import { gearAPI, type GearItemInfo } from "@/lib/api/gear";
import {
  buildDiveDraftValues,
  draftToFormValues,
  draftVesselUuids,
} from "@/lib/dive-drafts";
import { coursesAPI, type CourseLookupItem } from "@/lib/api/courses";
import { tripsAPI, type TripLookupItem } from "@/lib/api/trips";
import { mergePeople } from "@/lib/people";
import type { PersonReference } from "@/lib/api/people";
import {
  buildDiveCreate,
  diveCreateSchema,
  DiveCreateInput,
  emptyDiveFormValues,
} from "@/lib/validations/dive";
import { useMixtureFieldArray } from "@/components/dives/mixture-fields";
import { usePendingDiveFiles } from "@/components/dives/use-pending-dive-files";
import { carriedVessel } from "@/lib/tank-vessel";
import { useDiveFormVisibility } from "@/hooks/useDiveFormVisibility";
import { useDiveConditionsFill } from "@/hooks/useDiveConditionsFill";
import { entryFixAfterSave } from "@/lib/dive-recordings";
import { useDiveSitePrefill } from "@/hooks/useDiveSitePrefill";
import { useDivePickPrefill } from "@/hooks/useDivePickPrefill";
import { DiveForm } from "@/components/dives/dive-form";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DISCARD_DRAFT_CONFIRMATION } from "@/components/dives/dive-drafts-card";
import type { DiveFormDraftActions } from "@/components/dives/dive-form-actions";
import { useToast } from "@/components/ui/use-toast";
import { nowStartTime } from "@/lib/date-time";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api/error";

// How long Save as draft says Saved before it is a button again.
const SAVED_FOR_MS = 2000;

// The query string with the draft set, or cleared, without a navigation: a
// save never remounts the form, whose files picked so far live outside its values.
function replaceDraftParam(draftUuid: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (draftUuid) params.set("draft", draftUuid);
  else params.delete("draft");
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}`,
  );
}

// Each "Log a dive" starts a new form from the last dive and whatever the URL
// names. The router keeps this route mounted under `<Activity>` after the diver
// leaves it, so without the key a later visit would show the earlier visit's form
// - a site's values on a dive logged for a trip, and the prefill giving up on the
// dirty form before the trip lands. `bfcacheId` changes on every push or replace
// but not on back/forward, which still restores the draft; it stays put across a
// search-param-only change, hence the parameters in the key. `draft` is the one
// exception: the form writes it itself - its first Save as draft names the draft
// it made, and a draft gone elsewhere is cleared - and that change must not
// remount it. Every other change of `draft` does, a link to the plain form
// included, so the key carries a count of those rather than the param.
export function NewDivePageContent() {
  const { bfcacheId } = useRouter();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const draft = params.get("draft");
  params.delete("draft");

  // The `draft` the form last wrote, until the URL catches up with it.
  const [announced, setAnnounced] = useState<{ draft: string | null } | null>(
    null,
  );
  const [keyed, setKeyed] = useState({ draft, remounts: 0 });
  if (draft !== keyed.draft) {
    const ownWrite = announced !== null && announced.draft === draft;
    setKeyed({
      draft,
      remounts: ownWrite ? keyed.remounts : keyed.remounts + 1,
    });
    if (announced !== null) setAnnounced(null);
  }

  return (
    <NewDiveForm
      key={`${bfcacheId}?${params.toString()}#${keyed.remounts}`}
      onDraftParam={(next) => {
        setAnnounced({ draft: next });
        replaceDraftParam(next);
      }}
    />
  );
}

interface NewDiveFormProps {
  /** Sets or clears `?draft=` without a navigation or a remount. */
  onDraftParam: (draftUuid: string | null) => void;
}

function NewDiveForm({ onDraftParam }: NewDiveFormProps) {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // A list rather than one file: a dive logged off two computers has two
  // recordings, and the same computer's JSON beside its FIT is two files of one
  // recording. The API decides which is which when each is attached.
  const files = usePendingDiveFiles();
  // Whether the last-dive prefill below has landed, given up or failed - the
  // moment the primary site's values may be written over it.
  const [prefillSettled, setPrefillSettled] = useState(false);
  // What a course or trip picked later merges its people with.
  const [lastDivePeople, setLastDivePeople] = useState<PersonReference[]>([]);

  // Allow pre-selecting a trip/dive site/course via ?trip_uuid=... /
  // ?dive_site_uuid=... / ?course_uuid=..., e.g. when logging a dive from a
  // trip's, dive site's or course's detail page.
  //
  // A form opened over a draft (`?draft=`) takes none of them, nor anything from
  // the last dive: the draft is the form's state. Read once, at mount - the URL
  // gains a `draft` later when a fresh form is first saved as one, and that form
  // already holds its state.
  const [openedDraftUuid] = useState(() => searchParams.get("draft"));
  const fromUrl = (name: string) =>
    openedDraftUuid ? undefined : (searchParams.get(name) ?? undefined);
  const initialTripId = fromUrl("trip_uuid");
  const initialDiveSiteId = fromUrl("dive_site_uuid");
  const initialCourseId = fromUrl("course_uuid");

  // The draft this form saves into and logs from: the one it opened over, or the
  // one its first Save as draft made. A ref for the handlers, which must not make
  // a second draft while the first save is in flight; state for the buttons.
  const draftUuidRef = useRef<string | null>(openedDraftUuid);
  const [draftUuid, setDraftUuid] = useState<string | null>(openedDraftUuid);
  const [draftLoad, setDraftLoad] = useState<
    "none" | "loading" | "loaded" | "gone" | "failed"
  >(openedDraftUuid ? "loading" : "none");
  // Whether the draft held a dive number, which then stays rather than following
  // the date.
  const [draftNumbered, setDraftNumbered] = useState(false);
  const [draftStatus, setDraftStatus] =
    useState<DiveFormDraftActions["status"]>("idle");
  const savingDraftRef = useRef(false);
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  // Back/Cancel return to wherever this form was opened from - the trip or dive
  // site being logged against, an explicit `?from=`, or the dive list.
  const returnTo = useReturnTo({ href: "/dives", label: "Back to dives" });

  const form = useForm<DiveCreateInput>({
    resolver: zodResolver(diveCreateSchema),
    defaultValues: {
      ...emptyDiveFormValues(),
      dive_number: 1,
      start_time: nowStartTime(),
      trip_uuid: initialTripId,
      course_uuid: initialCourseId,
      dive_site_uuids:
        initialDiveSiteId !== undefined ? [initialDiveSiteId] : [],
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
  // After the last dive's prefill too, for the same reason as the site's. At the
  // entry fix the picked files give the saved dive.
  const conditions = useDiveConditionsFill({
    form,
    visibility,
    enabled: prefillSettled,
    position: entryFixAfterSave({ pending: files.fileList.pending }),
  });

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
    Boolean(user) &&
      (draftLoad === "none" || (draftLoad === "loaded" && !draftNumbered)),
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
    if (!userUuid || openedDraftUuid) return;

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
          // `emptyDiveFormValues`.
          mixtures:
            lastDive.mixtures?.map((m) => {
              // The same tank the same vessel, where the vessel can still be
              // linked - see `carriedVessel`.
              const vessel = carriedVessel(m);
              return {
                ...vessel,
                // `?? ""` on all three, like `po2_limit` below and for the reason
                // recorded under "The API sends `null`, the form schema only understood
                // `""`" in DECISIONS.md: these are nullable on the wire now that a
                // cylinder may record a mix with no vessel, `null` is a member of no
                // field's union in `diveMixtureSchema`, and a `reset()` seeded with one
                // fails validation on a value the diver never entered - silently, since
                // `handleSubmit`'s valid callback simply never fires. A last dive
                // imported from a file that recorded no cylinder size carries that
                // absence forward rather than acquiring an 11.1 L on the way.
                // A linked tank takes its vessel's capacity, as a pick does, so a
                // link the form makes never carries an import's differing figure.
                volume: vessel.gear_item?.volume ?? m.volume ?? ("" as const),
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
              };
            }) ?? [],
        };

        if (courseContact) autofill("contact_uuid", courseContact);
        if (urlPeople.length > 0) autofill("people", people);
        const seeded = prefill<DiveCreateInput>(
          {
            // Every field, since a field left out of a `reset` comes back
            // `undefined`. What `carried` does not name starts empty: the day's
            // readings - temperature, visibility, air, current, waves, weather -
            // and the diver's word on this dive and no other - rating, tags,
            // notes. Sightings too, unlike the gear: gear is habitual, sightings
            // are observations, and copying yesterday's turtle into today's dive
            // would fabricate a record of seeing it.
            ...emptyDiveFormValues(),
            // Kept, not recomputed: `useSuggestedDiveNumber` owns this field and
            // may already have filled it in by the time this prefill lands. The
            // two run concurrently, and whichever finishes second must not undo
            // the other - hence reading the current value back rather than
            // deriving one from `lastDive`, which would also be the wrong number
            // for a back-dated dive.
            dive_number: form.getValues("dive_number"),
            start_time: nowStartTime(),
            // `prefill` rewrites each of these keys against the visibility rules,
            // so the spread is the shape and the second argument is the meaning.
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
    openedDraftUuid,
    form,
    prefill,
    autofill,
    initialTripId,
    initialDiveSiteId,
    initialCourseId,
  ]);

  // The draft the form opened over, filled in as an edit load is: every value it
  // holds, a hidden field holding one put on screen. The conditions preview and
  // the site's values start after it, as they start after the last dive's
  // prefill on a fresh form.
  useEffect(() => {
    if (!userUuid || !openedDraftUuid) return;
    let cancelled = false;
    const load = async () => {
      try {
        const draft = await diveDraftsAPI.getDraft(openedDraftUuid);
        // The vessels its tanks link, for the tank picker's label and capacity;
        // one that does not resolve leaves its tank linked by uuid alone.
        const vessels = (
          await Promise.allSettled(
            draftVesselUuids(draft.values).map((uuid) =>
              gearAPI.getGearItem(uuid),
            ),
          )
        )
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value as GearItemInfo);
        if (cancelled) return;
        const values = draftToFormValues(draft.values, vessels);
        form.reset(values);
        revealNonEmpty(values);
        setDraftNumbered(values.dive_number !== undefined);
        setDraftLoad("loaded");
        setPrefillSettled(true);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load the dive draft:", error);
        setDraftLoad(getApiErrorStatus(error) === 404 ? "gone" : "failed");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [userUuid, openedDraftUuid, form, revealNonEmpty]);

  useEffect(() => {
    if (draftStatus !== "saved") return;
    const timer = setTimeout(() => setDraftStatus("idle"), SAVED_FOR_MS);
    return () => clearTimeout(timer);
  }, [draftStatus]);

  // A draft logged or discarded elsewhere - on the phone, say - while this form
  // was open over it. The form keeps what it holds and from here logs a new dive.
  const forgetDraft = useCallback(() => {
    draftUuidRef.current = null;
    setDraftUuid(null);
    onDraftParam(null);
    toast({
      title: "Draft no longer here",
      description:
        "This draft was logged or discarded somewhere else. The form now logs a new dive.",
      variant: "destructive",
    });
  }, [toast, onDraftParam]);

  // Whatever the form holds, valid or not, through `withhold` as Log dive sends
  // it, so a previewed weather value is never stored as the diver's.
  const saveDraft = async () => {
    if (savingDraftRef.current) return;
    savingDraftRef.current = true;
    setDraftStatus("saving");
    const values = buildDiveDraftValues(conditions.withhold(form.getValues()));
    const current = draftUuidRef.current;
    try {
      if (current) {
        await diveDraftsAPI.updateDraft(current, values);
      } else {
        const created = await diveDraftsAPI.createDraft(values);
        draftUuidRef.current = created.uuid;
        setDraftUuid(created.uuid);
        onDraftParam(created.uuid);
      }
      setDraftStatus("saved");
    } catch (error) {
      setDraftStatus("idle");
      if (current && getApiErrorStatus(error) === 404) {
        forgetDraft();
        return;
      }
      console.error("Failed to save the dive draft:", error);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to save the draft. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      savingDraftRef.current = false;
    }
  };

  const discardDraft = async () => {
    const current = draftUuidRef.current;
    if (!current) return;
    setIsDiscarding(true);
    try {
      await diveDraftsAPI.deleteDraft(current);
    } catch (error) {
      // Already gone is what the diver asked for.
      if (getApiErrorStatus(error) !== 404) {
        setIsDiscarding(false);
        toast({
          title: "Error",
          description: getApiErrorMessage(
            error,
            "Failed to discard the draft. Please try again.",
          ),
          variant: "destructive",
        });
        return;
      }
    }
    router.push("/dives");
  };

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (draftLoad === "loading") {
    return (
      <FormPageSkeleton
        backHref={returnTo.href}
        backLabel={returnTo.label}
        fields={8}
      />
    );
  }

  if (draftLoad === "gone" || draftLoad === "failed") {
    return (
      <div className={PAGE_COLUMN}>
        <NotFoundState
          message={
            draftLoad === "gone"
              ? "This draft is no longer here - it was logged or discarded, perhaps on another device."
              : "Couldn't load this draft. Please try again."
          }
          backHref="/dives/new"
          backLabel="Log a new dive"
        />
      </div>
    );
  }

  const onSubmit = async (data: DiveCreateInput) => {
    if (savingDraftRef.current) return;
    try {
      setIsSubmitting(true);

      const body = buildDiveCreate(conditions.withhold(data));
      const fromDraft = draftUuidRef.current;
      let created;
      if (fromDraft) {
        // One request: the dive is created and the draft gone together.
        try {
          created = await diveDraftsAPI.logDraft(fromDraft, body);
        } catch (error) {
          if (getApiErrorStatus(error) !== 404) throw error;
          forgetDraft();
          return;
        }
      } else {
        created = await divesAPI.createDive(body);
      }

      // The files wait for the dive, since `/dive/parse` stores nothing.
      await files.save(created.uuid, {
        saved: "Dive logged, but ",
        attachFallback: "You can attach it from the dive's edit page.",
      });

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
    <div>
      <PlainHero
        backHref={returnTo.href}
        backLabel={returnTo.label}
        icon={DiveIcon}
        title="Log New Dive"
        subtitle="Record the details of your dive"
        figures={[]}
        column={FORM_COLUMN}
        actions={<DiveFormFieldsMenu visibility={visibility} />}
      />

      <div className={FORM_BODY}>
        <DiveForm
          form={form}
          mixtureFieldArray={mixtureFieldArray}
          visibility={visibility}
          mode="create"
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          cancelHref={returnTo.href}
          submittingLabel="Logging dive..."
          submitLabel="Log dive"
          fileList={files.fileList}
          diveNumberNotice={diveNumberNotice}
          fetched={conditions.marks}
          draft={{
            onSave: saveDraft,
            status: draftStatus,
            onDiscard: draftUuid ? () => setIsDiscardOpen(true) : undefined,
          }}
        />
      </div>

      <ConfirmDialog
        open={isDiscardOpen}
        onOpenChange={setIsDiscardOpen}
        title="Discard draft"
        description={DISCARD_DRAFT_CONFIRMATION}
        confirmText="Discard"
        isLoading={isDiscarding}
        onConfirm={discardDraft}
      />
    </div>
  );
}
