"use client";

import { useEffect, useState } from "react";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { FormApiError } from "@/components/ui/form-api-error";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Save } from "lucide-react";
import {
  tripFormSchema,
  TripFormInput,
  normalizeTripDates,
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
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { TripLocationMultiSelect } from "@/components/trips/trip-location-multi-select";
import { LocationsMap } from "@/components/map/locations-map-lazy";

interface TripDialogProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pass an existing trip to edit it; omit to create a new one.
  trip?: Trip | null;
  // Called with the created/updated trip so the caller can refresh whatever
  // list it's showing - and, in the dive form, select it straight away.
  onSaved: (trip: Trip) => void;
}

// The one create/edit form for a trip, used by the trips list and detail pages,
// the header's quick-create menu and the dive form's trip picker. A trip is five
// fields, so a dialog beats navigating away from wherever the diver was - which
// matters most in the dive form, where a page would mean abandoning a
// half-filled dive.
export function TripDialog({
  userId,
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
      locations: [],
      start_date: "",
      end_date: "",
      notes: "",
    },
  });

  // `useWatch` rather than `form.watch()`: the map below the picker is the only
  // thing that re-renders when a place is added or dragged, and `watch()` would
  // re-render the whole dialog - every keystroke in the notes field included.
  const locations = useWatch({ control: form.control, name: "locations" });

  // Places typed in by hand have no position, so only the geocoded ones reach
  // the map - the picker's own rows say "not on the map" about the rest.
  const mappedLocations = (locations ?? []).filter(
    (location) => location.latitude != null && location.longitude != null,
  );

  // Reload the form whenever the dialog is opened, so it shows the trip being
  // edited (or a clean slate) rather than whatever the previous invocation left
  // behind.
  const { reset } = form;
  useEffect(() => {
    if (!open) return;
    reset({
      name: trip?.name ?? "",
      locations: trip?.locations ?? [],
      start_date: trip?.start_date ?? "",
      end_date: trip?.end_date ?? "",
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

      if (trip) {
        // The API answers a PATCH with just a status message, so the updated
        // trip is assembled here for the caller.
        //
        // Locations are always sent, never omitted: the form shows the whole
        // list and the API replaces it wholesale, so an unchanged list costs a
        // re-insert while a missing key would make "remove them all" impossible
        // to express.
        const changes = {
          ...normalizeTripDates(data),
          locations: data.locations ?? [],
        };
        await tripsAPI.updateTrip(trip.uuid, changes);
        onSaved({
          ...trip,
          name: data.name,
          locations: changes.locations,
          start_date: changes.start_date,
          end_date: changes.end_date,
          notes: data.notes,
        });
      } else {
        const created = await tripsAPI.createTrip({
          user_uuid: userId,
          name: data.name,
          locations: data.locations ?? [],
          start_date: data.start_date,
          end_date: data.end_date || undefined,
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date *</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="locations"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {(field.value?.length ?? 0) > 1 ? "Locations" : "Location"}
                  </FormLabel>
                  <FormControl>
                    <TripLocationMultiSelect
                      value={field.value ?? []}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Confirmation only, and deliberately below the picker: the diver
                searched for a name, and this answers "yes, that is the place I
                meant" without asking them to do anything with it.

                On screen from the moment the dialog opens, empty world and all,
                like the dive site form's own map. A frame that appeared with
                the first place would shove the Notes field down the dialog
                mid-edit, and an empty one is what makes it obvious the picker
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
                    Save Changes
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Trip
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
