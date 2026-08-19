"use client";

import { useEffect, useState } from "react";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Save } from "lucide-react";
import {
  diveSiteFormSchema,
  DiveSiteFormInput,
  formatCoordinateForForm,
  parseCoordinatePair,
  parseFormCoordinate,
} from "@/lib/validations/dive-site";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import { GeocodeResult } from "@/lib/api/geocoding";
import { DiveSiteMapField } from "@/components/sites/dive-site-map-field";
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

const COORDINATE_HINT =
  "Paste a “27.8506, 34.3136” pair into either field to fill both, or place the site on the map below.";

interface DiveSiteDialogProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pass an existing dive site to edit it; omit to create a new one.
  diveSite?: DiveSite | null;
  // Called with the created/updated dive site so the caller can refresh
  // whatever list it's showing - and, in the dive form, select it straight away.
  onSaved: (diveSite: DiveSite) => void;
}

// The one create/edit form for a dive site, used by the dive sites list and
// detail pages, the header's quick-create menu and the dive form's site picker.
// Short enough that a dialog beats navigating away from wherever the diver was -
// which matters most in the dive form, where a page would mean abandoning a
// half-filled dive.
export function DiveSiteDialog({
  userId,
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
    defaultValues: {
      name: "",
      location: "",
      latitude: "",
      longitude: "",
      notes: "",
    },
  });

  // Reload the form whenever the dialog is opened, so it shows the dive site
  // being edited (or a clean slate) rather than whatever the previous
  // invocation left behind.
  const { reset, setValue } = form;
  useEffect(() => {
    if (!open) return;
    reset({
      name: diveSite?.name ?? "",
      location: diveSite?.location ?? "",
      latitude: formatCoordinateForForm(diveSite?.latitude),
      longitude: formatCoordinateForForm(diveSite?.longitude),
      notes: diveSite?.notes ?? "",
    });
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
  // the map. The geocoded place name is written straight into the Location
  // field; it stays an ordinary text input, so a diver who wants something else
  // types over it.
  const geocoded = useGeocodedLocation({
    open,
    latitude: watchedLatitude,
    longitude: watchedLongitude,
    location: watchedLocation,
    onUseLocation: (value) =>
      setValue("location", value, { shouldValidate: true, shouldDirty: true }),
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

  // A place picked from the search already knows its own name, so there is
  // nothing to look up - but it fills exactly the same three fields.
  const placeResult = (result: GeocodeResult) => {
    const position = {
      latitude: formatCoordinateForForm(result.latitude),
      longitude: formatCoordinateForForm(result.longitude),
    };
    setPosition(position);
    geocoded.adopt(position, result);
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

      if (diveSite) {
        // The API answers a PATCH with just a status message, so the updated
        // dive site is assembled here for the caller.
        const update = {
          name: data.name,
          location: data.location,
          latitude,
          longitude,
          notes: data.notes,
        };
        await diveSitesAPI.updateDiveSite(diveSite.uuid, update);
        onSaved({ ...diveSite, ...update });
      } else {
        const created = await diveSitesAPI.createDiveSite({
          user_uuid: userId,
          name: data.name,
          location: data.location || undefined,
          latitude,
          longitude,
          notes: data.notes || undefined,
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
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Dahab, Egypt" {...field} />
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
              onPickPlace={placeResult}
              credit={geocoded.credit}
              announcement={geocoded.announcement}
            />

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

            {apiError && <p className="text-sm text-destructive">{apiError}</p>}

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
                    Save Changes
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Dive Site
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
