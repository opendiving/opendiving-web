"use client";

import { useState } from "react";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { FormApiError } from "@/components/ui/form-api-error";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Save } from "lucide-react";
import {
  tripFormSchema,
  TripFormInput,
  normalizeTripParts,
} from "@/lib/validations/trip";
import { tripsAPI, Trip } from "@/lib/api/trips";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { TripPartsField } from "@/components/trips/trip-parts-field";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";

interface TripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pass an existing trip to edit it; omit to create a new one.
  trip?: Trip | null;
  // Called with the created/updated trip so the caller can refresh whatever
  // list it's showing - and, in the dive form, select it straight away.
  onSaved: (trip: Trip) => void;
}

// The one create/edit form for a trip, used by the trips list and detail pages,
// the header's quick-create menu and the dive form's trip picker. A trip is a
// name, a list of parts and some notes, so a dialog beats navigating away from
// wherever the diver was - which matters most in the dive form, where a page
// would mean abandoning a half-filled dive.
export function TripDialog({
  open,
  onOpenChange,
  trip,
  onSaved,
}: TripDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useDialogApiError(open);
  const isEdit = !!trip;

  const form = useForm<TripFormInput>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: {
      name: "",
      parts: [],
      notes: "",
    },
  });

  // `useWatch` rather than `form.watch()`: the map below the field is the only
  // thing that re-renders when a place is picked or a row dragged, and `watch()`
  // would re-render the whole dialog - every keystroke in the notes field
  // included.
  const parts = useWatch({ control: form.control, name: "parts" });

  // A part need not have a place at all, and a place typed in by hand has no
  // position, so only the geocoded ones reach the map - the rows themselves are
  // what account for the rest.
  const mappedLocations = (parts ?? [])
    .map((part) => part.location)
    .filter(
      (location): location is NonNullable<typeof location> =>
        location != null &&
        location.latitude != null &&
        location.longitude != null,
    );

  // Reload the form whenever the dialog is opened, so it shows the trip being
  // edited (or a clean slate) rather than whatever the previous invocation left
  // behind.
  const { reset } = form;
  useEffectOnChange(() => {
    if (!open) return;
    reset({
      name: trip?.name ?? "",
      // "" rather than `undefined` for a date a part does not carry: that is the
      // live "cleared" sentinel react-hook-form needs, and `normalizeTripParts`
      // is what turns it back into an absent member (DECISIONS.md).
      parts: (trip?.parts ?? []).map((part) => ({
        location: part.location ?? null,
        start_date: part.start_date ?? "",
        end_date: part.end_date ?? "",
      })),
      notes: trip?.notes ?? "",
    });
  }, [open, trip, reset]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setApiError(null);
    onOpenChange(next);
  };

  const onSubmit = async (data: TripFormInput) => {
    setApiError(null);
    try {
      setIsSubmitting(true);

      // Parts are always sent, never omitted: the form shows the whole list and
      // the API replaces it wholesale, so an unchanged list costs a re-insert
      // while a missing key would make "remove them all" impossible to express.
      const parts = normalizeTripParts(data.parts);

      if (trip) {
        // The API answers a PATCH with just a status message, so the updated
        // trip is assembled here for the caller.
        await tripsAPI.updateTrip(trip.uuid, { name: data.name, parts, notes: data.notes });
        onSaved({ ...trip, name: data.name, parts, notes: data.notes });
      } else {
        const created = await tripsAPI.createTrip({
          name: data.name,
          parts,
          notes: data.notes || undefined,
        });
        onSaved(created);
      }

      onOpenChange(false);
    } catch (error) {
      setApiError(
        getApiErrorMessage(
          error,
          `Failed to ${isEdit ? "update" : "create"} trip. Please try again.`,
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
          <DialogTitle>{isEdit ? "Edit Trip" : "New Trip"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          {/* `dialogFormSubmit` keeps this submit from bubbling into the dive
              form this dialog can be opened from - see `lib/dialog-form.ts`. */}
          {/* `min-w-0` is load-bearing, and not where the problem looks like it
              is. `DialogContent` is a grid, this form is its item, and a grid
              item's default `min-width: auto` is its min-content - so one
              location row of "Ko Tao, Ko Tao, Ko Pha-ngan District, Surat Thani
              Province, Thailand", held on one line by `truncate`, widened the
              whole dialog to 888px and pushed every other field out past its
              edge. Truncating the row is necessary and does nothing on its own:
              only the grid item can decide it is allowed to be narrower than
              its contents. */}
          <form
            onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
            className="min-w-0 space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Red Sea Liveaboard 2024"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* The dates live on the parts now, so there is no trip-level date
                row above this: a trip's span is the span of what is in here. */}
            <FormField
              control={form.control}
              name="parts"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parts</FormLabel>
                  <FormControl>
                    <TripPartsField
                      value={field.value ?? []}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Confirmation only, and deliberately below the parts: the diver
                searched for a name, and this answers "yes, that is the place I
                meant" without asking them to do anything with it.

                On screen from the moment the dialog opens, empty world and all,
                like the dive site form's own map. A frame that appeared with
                the first place would shove the Notes field down the dialog
                mid-edit, and an empty one is what makes it obvious the field
                above it is asking for somewhere on a map. */}
            <LocationsMap
              locations={mappedLocations}
              subject="the trip's locations"
              showWhenEmpty
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any notes about this trip..."
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
                    Create trip
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
