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
  parseCoordinatePair,
  parseFormCoordinate,
  parseFormPosition,
} from "@/lib/validations/dive-site";
import { diveSitesAPI, DiveSite, ExternalId } from "@/lib/api/dive-sites";
import { pickExternalId } from "@/lib/external-ids";
import {
  MAX_LOCATION_NAME_LENGTH,
  type LocationFormValue,
} from "@/lib/validations/location";
import { DiveSiteMapField } from "@/components/sites/dive-site-map-field";
import { DiveSiteDetailsFields } from "@/components/sites/dive-site-details-fields";
import { OtherNamesField } from "@/components/sites/other-names-field";
import { ExternalIdsField } from "@/components/sites/external-ids-field";
import {
  LocationSearchDialog,
  type SearchedLocation,
} from "@/components/sites/location-search-dialog";
import { MapSearchIcon } from "@/components/icons/map-search-icon";
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
import { IconTooltip } from "@/components/ui/tooltip";
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
  // Forwarded to `DialogContent`; preventing it keeps focus from returning to
  // whatever opened the dialog.
  onCloseAutoFocus?: (event: Event) => void;
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
  onCloseAutoFocus,
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
  const [searchOpen, setSearchOpen] = useState(false);

  // Reload the form whenever the dialog is opened, so it shows the dive site
  // being edited (or a clean slate) rather than whatever the previous
  // invocation left behind.
  const { reset, setValue, getValues } = form;
  useEffectOnChange(() => {
    if (!open) return;
    reset(diveSiteFormValues(diveSite));
    pickedEntry.current = null;
    setSearchOpen(false);
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

  // Owned here rather than by the map, because both ways of placing a position
  // have to reach the same lookup and only one of them comes through the map.
  // The place it answers with is written straight into the Location field; the
  // field's visible half stays an ordinary text input, so a diver who wants
  // something else types over it.
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

  // The map, the location search and the paste handler all write into the same two
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

  // What the location search settled on fills the coordinate pair and the
  // Location beside it, wholesale - including the name it looked up for the
  // form's position on opening, which replaces whatever Location held, as
  // placing that pin by hand would have.
  //
  // A catalog dive site fills Name as well, and always - a diver who wanted
  // something else types over it, exactly as they do with the Location. Filling
  // it only when empty would never clobber typed text, at the price of a rule
  // nobody can predict from looking at the form. Its registry entry goes with
  // it, on an edit as on a create - which is how a site made before picks kept
  // one gets its identity: re-pick its row. See `pickExternalId` for which
  // entries the pick replaces and which it keeps.
  const applySearchedLocation = ({
    location,
    credit,
    site,
    ...position
  }: SearchedLocation) => {
    setPosition(position);
    if (parseFormPosition(position.latitude, position.longitude)) {
      geocoded.adopt(
        position,
        location && credit ? { location, attribution: credit } : null,
      );
    }
    setValue("location", location, {
      shouldValidate: true,
      shouldDirty: true,
    });
    if (!site) return;
    setValue("name", site.name, { shouldValidate: true, shouldDirty: true });
    const { externalIds, added } = pickExternalId(
      getValues("external_ids") ?? [],
      pickedEntry.current,
      site.external_id,
    );
    setValue("external_ids", externalIds, { shouldDirty: true });
    pickedEntry.current = added;
  };

  // Taking the held site the search offered hands it back as though it had
  // just been saved here, so whatever opened the dialog - the dive form's
  // picker selecting it, the header's menu opening its page - does what it does
  // with a new one, and nothing is created.
  const takeHeldSite = async (uuid: string) => {
    setApiError(null);
    try {
      setIsSubmitting(true);
      onSaved(await diveSitesAPI.getDiveSite(uuid));
      setSearchOpen(false);
      onOpenChange(false);
    } catch (error) {
      setSearchOpen(false);
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
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
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
                  <div className="flex gap-2">
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
                        onChange={(event) =>
                          typeLocationName(event.target.value)
                        }
                      />
                    </FormControl>
                    <IconTooltip label="Search location">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => setSearchOpen(true)}
                      >
                        <MapSearchIcon className="h-4 w-4" />
                      </Button>
                    </IconTooltip>
                  </div>
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
              credit={geocoded.credit}
              announcement={geocoded.announcement}
            />

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

        {/* Outside the form: its fields are not this form's, and nothing in it
            submits. */}
        <LocationSearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          latitude={watchedLatitude}
          longitude={watchedLongitude}
          location={watchedLocation}
          offerHeldSites={!isEdit}
          onTakeHeldSite={takeHeldSite}
          busy={isSubmitting}
          onUse={applySearchedLocation}
        />
      </DialogContent>
    </Dialog>
  );
}
