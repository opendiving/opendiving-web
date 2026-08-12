"use client";

import { useEffect, useState } from "react";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { useForm } from "react-hook-form";
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
      location: "",
      start_date: "",
      end_date: "",
      notes: "",
    },
  });

  // Reload the form whenever the dialog is opened, so it shows the trip being
  // edited (or a clean slate) rather than whatever the previous invocation left
  // behind.
  const { reset } = form;
  useEffect(() => {
    if (!open) return;
    reset({
      name: trip?.name ?? "",
      location: trip?.location ?? "",
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
        const changes = normalizeTripDates(data);
        await tripsAPI.updateTrip(trip.uuid, changes);
        onSaved({
          ...trip,
          name: data.name,
          location: data.location,
          start_date: changes.start_date,
          end_date: changes.end_date,
          notes: data.notes,
        });
      } else {
        const created = await tripsAPI.createTrip({
          user_uuid: userId,
          name: data.name,
          location: data.location || undefined,
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

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Koh Tao, Thailand" {...field} />
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
