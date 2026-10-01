"use client";

import { useRef, useState } from "react";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { FormApiError } from "@/components/ui/form-api-error";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Save } from "lucide-react";
import {
  diveSiteFormSchema,
  DiveSiteFormInput,
  diveSiteFormValues,
  diveSiteMembersFromForm,
  formatCoordinateForForm,
  parseCoordinatePair,
  parseFormCoordinate,
} from "@/lib/validations/dive-site";
import { diveSitesAPI, DiveSite, ExternalId } from "@/lib/api/dive-sites";
import { pickExternalId } from "@/lib/external-ids";
import { GeocodeResult } from "@/lib/api/geocoding";
import { geocodeResultToLocation } from "@/lib/locations";
import {
  MAX_LOCATION_NAME_LENGTH,
  type LocationFormValue,
} from "@/lib/validations/location";
import {
  diveSitePlaceContext,
  DiveSiteSuggestion,
} from "@/lib/api/dive-site-catalog";
import { DiveSiteMapField } from "@/components/sites/dive-site-map-field";
import { DiveSiteDetailsFields } from "@/components/sites/dive-site-details-fields";
import { HeldSiteOffer } from "@/components/sites/held-site-offer";
import { OtherNamesField } from "@/components/sites/other-names-field";
import { ExternalIdsField } from "@/components/sites/external-ids-field";
import type { PlacePick } from "@/components/sites/place-search";
import { useGeocodedLocation } from "@/hooks/useGeocodedLocation";
import { getApiErrorMessage } from "@/lib/api/error";
import { dialogFormSubmit } from "@/lib/dialog-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";

const COORDINATE_HINT =
  "Paste a “27.8506, 34.3136” pair into either field to fill both, or place the site on the map below.";

interface DiveSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pass an existing dive site to edit it; omit to create a new one.
  diveSite?: DiveSite | null;
  // Called with the created/updated dive site so the caller can refresh
  // whatever list it's showing - and, in the dive form, select it straight away.
  onSaved: (diveSite: DiveSite) => void;
}

// The API answers a PATCH with a status message alone, and canonicalizes what it
// stores - another name the name already says is dropped, a tag takes the spelling
// the diver already has - so the saved site is read back rather than assembled.
// A failed read is not a failed save: the assembled site stands in for it.
async function readBack(
  site: DiveSite,
  update: Partial<DiveSite>,
): Promise<DiveSite> {
  try {
    return await diveSitesAPI.getDiveSite(site.uuid);
  } catch (error) {
    console.error("Failed to read the saved dive site back:", error);
    return { ...site, ...update };
  }
}

// The one create/edit form for a dive site, used by the dive sites list and
// detail pages, the header's quick-create menu and the dive form's site picker.
// Short enough that a dialog beats navigating away from wherever the diver was -
// which matters most in the dive form, where a page would mean abandoning a
// half-filled dive.
export function DiveSiteDialog({
  open,
  onOpenChange,
  diveSite,
  onSaved,
}: DiveSiteDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useDialogApiError(open);
  const isEdit = !!diveSite;

  const form = useForm<DiveSiteFormInput>({
    resolver: zodResolver(diveSiteFormSchema),
    defaultValues: diveSiteFormValues(null),
  });

  // The registry entry the last catalogue pick in this dialog added, which the
  // next pick replaces. A ref, since nothing renders from it.
  const pickedEntry = useRef<ExternalId | null>(null);
  // A catalogue row the diver already holds a site for, picked while creating:
  // the held site is offered before anything is filled.
  const [offer, setOffer] = useState<DiveSiteSuggestion | null>(null);

  // Reload the form whenever the dialog is opened, so it shows the dive site
  // being edited (or a clean slate) rather than whatever the previous
  // invocation left behind.
  const { reset, setValue, getValues } = form;
  useEffectOnChange(() => {
    if (!open) return;
    reset(diveSiteFormValues(diveSite));
    pickedEntry.current = null;
    setOffer(null);
  }, [open, diveSite, reset]);

  // `useWatch` rather than `form.watch()`, which is what `mixture-fields.tsx`
  // does and for the same reason: a subscription scoped to the fields that are
  // actually read, instead of one that re-renders this dialog on every
  // keystroke in the notes field. (`react-hooks/incompatible-library` also
  // rejects `watch()` here - it returns a fresh function each render, which
  // cannot be memoized safely.)
  const watched = useWatch({
    control: form.control,
    name: ["latitude", "longitude", "location"],
  });
  const [watchedLatitude, watchedLongitude, watchedLocation] = watched;

  const handleOpenChange = (next: boolean) => {
    if (!next) setApiError(null);
    onOpenChange(next);
  };

  // Owned here rather than by the map, because all three ways of placing a
  // position have to reach the same lookup and only one of them comes through
  // the map. The place it answers with is written straight into the Location
  // field; the field's visible half stays an ordinary text input, so a diver who
  // wants something else types over it.
  const geocoded = useGeocodedLocation({
    open,
    latitude: watchedLatitude,
    longitude: watchedLongitude,
    location: watchedLocation,
    onUseLocation: (value) =>
      setValue("location", value, { shouldValidate: true, shouldDirty: true }),
  });

  // What the diver types is a place's name and nothing more, so it replaces
  // whatever was there rather than renaming it: a centre and a box picked for
  // "Dahab, South Sinai, Egypt" say nothing true about the "Moalboal" now in the
  // box. Emptying the field clears the place outright, which is how a site
  // entered with the wrong locality is corrected back to "not recorded".
  const typeLocationName = (text: string) =>
    setValue("location", text.trim() ? { name: text } : null, {
      shouldValidate: true,
      shouldDirty: true,
    });

  // The map, the search and the paste handler all write into the same two
  // fields rather than holding a position of their own, so there is one source
  // of truth and the pair stays typeable, pasteable and clearable exactly as
  // before. `shouldValidate` because a placed position completes the
  // both-or-neither rule and should clear its message.
  const setPosition = (position: { latitude: string; longitude: string }) => {
    setValue("latitude", position.latitude, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setValue("longitude", position.longitude, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  // A position that arrived without a name: dropped on the map, or pasted into
  // the coordinates. The geocoder is asked what is there.
  const placePosition = (position: { latitude: string; longitude: string }) => {
    setPosition(position);
    geocoded.lookup(position);
  };

  // A geocoded place fills the coordinate pair and the Location beside it. It
  // has nothing to say about what the *site* is called - the geocoder knows
  // where Dahab is, not that there is a Blue Hole in it - so Name is left alone.
  //
  // The whole place goes into Location, centre and box included: a forward
  // search answered about the place itself, so its coordinates are the
  // locality's own and not the pin this pick is about to drop. The pin lands on
  // the same point here only because there is nothing better to put it on yet.
  const placeResult = (result: GeocodeResult) => {
    const position = {
      latitude: formatCoordinateForForm(result.latitude),
      longitude: formatCoordinateForForm(result.longitude),
    };
    setPosition(position);
    geocoded.adopt(position, {
      location: geocodeResultToLocation(result),
      attribution: result.attribution,
    });
  };

  // A catalog dive site fills Name as well, and always - a diver who wanted
  // something else types over it, exactly as they do with the Location the
  // geocoder writes. Filling it only when empty would never clobber typed text,
  // at the price of a rule nobody can predict from looking at the form.
  //
  // Location comes off the record rather than out of a lookup: the catalog
  // already resolved `region, country` when it was built, so a pick spends no
  // request at all beyond the search that produced it. Where the record resolved
  // to neither, `diveSitePlaceContext` answers null and the field is left
  // untouched - a site with no place context is not an answer about where the
  // site is, and clearing what a diver typed on the strength of one would be the
  // mistake `useGeocodedLocation` already refuses for an `unknown` lookup.
  //
  // A name and nothing else, because that is all the record holds: its
  // coordinates are the *site's*, and the catalog never resolved a centre or an
  // extent for the region it names.
  //
  // The record's registry entry goes with it, on an edit as on a create - which
  // is how a site made before picks kept one gets its identity: re-pick its row.
  // See `pickExternalId` for which entries the pick replaces and which it keeps.
  const fillFromCatalogSite = (site: DiveSiteSuggestion) => {
    setOffer(null);
    const position = {
      latitude: formatCoordinateForForm(site.latitude),
      longitude: formatCoordinateForForm(site.longitude),
    };
    setValue("name", site.name, { shouldValidate: true, shouldDirty: true });
    setPosition(position);
    const place = diveSitePlaceContext(site);
    geocoded.adopt(
      position,
      place
        ? { location: { name: place }, attribution: site.attribution }
        : null,
    );
    const { externalIds, added } = pickExternalId(
      getValues("external_ids") ?? [],
      pickedEntry.current,
      site.external_id,
    );
    setValue("external_ids", externalIds, { shouldDirty: true });
    pickedEntry.current = added;
  };

  // A row the diver already has a site for, picked while creating one, offers
  // that site first and fills nothing until they answer. While editing there is
  // nothing to offer: the pick fills the site being edited, which may be the
  // very site the row names.
  const placeCatalogSite = (site: DiveSiteSuggestion) => {
    if (!isEdit && site.held_site) {
      setOffer(site);
      return;
    }
    fillFromCatalogSite(site);
  };

  // Taking the offer hands the held site back as though it had just been saved
  // here, so whatever opened the dialog - the dive form's picker selecting it,
  // the header's menu opening its page - does what it does with a new one, and
  // nothing is created.
  const takeOffer = async (uuid: string) => {
    setApiError(null);
    try {
      setIsSubmitting(true);
      onSaved(await diveSitesAPI.getDiveSite(uuid));
      onOpenChange(false);
    } catch (error) {
      setApiError(
        getApiErrorMessage(
          error,
          "Failed to open that dive site. Please try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // A row picked from the search already knows its own name, so there is
  // nothing to look up. Which fields it fills depends on where it came from,
  // and the pick says so itself rather than leaving this to be read off the
  // menu-row id it came back as.
  const placePick = (pick: PlacePick) =>
    pick.kind === "catalog"
      ? placeCatalogSite(pick.site)
      : placeResult(pick.result);

  // A pasted "27.8506, 34.3136" fills both fields rather than landing whole in
  // whichever one had focus. Anything that isn't a pair pastes as usual.
  //
  // It goes through `placePosition` rather than writing the fields directly:
  // pasting a pair copied off another map is placing the site just as much as
  // clicking is, and a diver who does it should not be the only one left to
  // type the location out by hand.
  const handleCoordinatePaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    const pair = parseCoordinatePair(event.clipboardData.getData("text"));
    if (!pair) return;
    event.preventDefault();
    placePosition(pair);
  };

  const onSubmit = async (data: DiveSiteFormInput) => {
    setApiError(null);
    try {
      setIsSubmitting(true);

      // The form holds coordinates as strings; the API wants numbers, or
      // `null` for a pair the diver cleared.
      const latitude = parseFormCoordinate(data.latitude);
      const longitude = parseFormCoordinate(data.longitude);

      // The whole place, or an explicit null. Naming it replaces the stored one
      // wholesale, which is why the field carries the object it was seeded with
      // rather than a text box over its name; null is what clears a locality
      // that was entered wrongly.
      const location = data.location ?? null;
      const members = diveSiteMembersFromForm(data);

      if (diveSite) {
        const update = {
          name: data.name,
          location,
          latitude,
          longitude,
          notes: data.notes,
          ...members,
        };
        await diveSitesAPI.updateDiveSite(diveSite.uuid, update);
        onSaved(await readBack(diveSite, update));
      } else {
        const created = await diveSitesAPI.createDiveSite({
          name: data.name,
          location,
          latitude,
          longitude,
          notes: data.notes || undefined,
          ...members,
        });
        onSaved(created);
      }

      onOpenChange(false);
    } catch (error) {
      setApiError(
        getApiErrorMessage(
          error,
          `Failed to ${isEdit ? "update" : "create"} dive site. Please try again.`,
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Dive Site" : "New Dive Site"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          {/* `dialogFormSubmit` keeps this submit from bubbling into the dive
              form this dialog can be opened from - see `lib/dialog-form.ts`. */}
          <form
            onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Blue Hole" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="other_names"
              render={({ field }) => (
                <OtherNamesField
                  value={field.value ?? []}
                  onChange={field.onChange}
                />
              )}
            />

            {/* The field holds the whole place; the input is a view of its
                name. What a pick brought with it - the locality's own centre
                and its extent - rides along unseen and is sent back on every
                save, so editing a site's name does not quietly strip the place
                off it. */}
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Dahab, South Sinai, Egypt"
                      // The cap is enforced by the control, not left to the
                      // resolver: an over-long name fails at `location.name`,
                      // and `FormMessage` reads `errors.location`, which for a
                      // nested failure is a container with no `message` of its
                      // own - so the diver would get the word "undefined" in
                      // red and a save that stopped. The trip row's place field
                      // closes the same hole by truncating what it commits.
                      // Nothing else can overrun it: every place written here
                      // programmatically comes from the API, which bounds the
                      // name to this width and truncates rather than raising.
                      maxLength={MAX_LOCATION_NAME_LENGTH}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      disabled={field.disabled}
                      value={field.value?.name ?? ""}
                      onChange={(event) => typeLocationName(event.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Deliberately no `inputMode="decimal"`/`"numeric"`: iOS shows a
                keypad with no minus key and no way to switch, which would make
                every southern/western coordinate untypeable. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="latitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 27.8506"
                        onPaste={handleCoordinatePaste}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="sr-only">
                      {COORDINATE_HINT}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="longitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitude</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 34.3136"
                        onPaste={handleCoordinatePaste}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="sr-only">
                      {COORDINATE_HINT}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* The hint belongs to the pair, so it renders once visually here,
                and again as an `sr-only` <FormDescription> inside each field so
                both announce it. Putting the id on this <p> and pointing the
                inputs at it instead would look equivalent and silently break
                error announcement: <FormControl> already sets
                `aria-describedby`, and the Slot lets the child's value win, so
                the message id would be dropped. Hidden from AT to avoid
                reading the same sentence a third time. */}
            <p className="-mt-2 text-sm text-muted-foreground" aria-hidden>
              {COORDINATE_HINT}
            </p>

            <DiveSiteMapField
              latitude={watchedLatitude}
              longitude={watchedLongitude}
              onPick={placePosition}
              onPickPlace={placePick}
              credit={geocoded.credit}
              announcement={geocoded.announcement}
              pickNotice={
                <HeldSiteOffer
                  suggestion={offer}
                  disabled={isSubmitting}
                  onTake={takeOffer}
                  onDecline={fillFromCatalogSite}
                />
              }
            />

            {/* Under the search, since a pick from it is what adds one. */}
            <FormField
              control={form.control}
              name="external_ids"
              render={({ field }) => (
                <ExternalIdsField
                  value={field.value ?? []}
                  onChange={field.onChange}
                />
              )}
            />

            <DiveSiteDetailsFields control={form.control} />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any notes about this dive site..."
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormApiError error={apiError} />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isEdit ? "Saving..." : "Creating..."}
                  </>
                ) : isEdit ? (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save changes
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create dive site
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
