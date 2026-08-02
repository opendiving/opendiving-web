"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { tripCreateSchema, TripCreateInput, normalizeTripDates } from "@/lib/validations/trip";
import { tripsAPI, Trip } from "@/lib/api/trips";
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
import { Button } from "@/components/ui/button";

interface NewTripDialogProps {
  username: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (trip: Trip) => void;
}

export function NewTripDialog({
  username,
  open,
  onOpenChange,
  onCreated,
}: NewTripDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const form = useForm<TripCreateInput>({
    resolver: zodResolver(tripCreateSchema),
    defaultValues: { name: "", location: "", start_date: "", end_date: "" },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset();
      setApiError(null);
    }
    onOpenChange(next);
  };

  const onSubmit = async (data: TripCreateInput) => {
    setApiError(null);
    try {
      setIsSubmitting(true);
      const { start_date, end_date } = normalizeTripDates(data);
      const newTrip = await tripsAPI.createTrip(username, {
        name: data.name,
        location: data.location || undefined,
        start_date,
        end_date,
      });
      form.reset();
      onCreated(newTrip);
      onOpenChange(false);
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ?? "Failed to create trip. Please try again.";
      setApiError(typeof message === "string" ? message : JSON.stringify(message));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Trip</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Red Sea Liveaboard 2024" autoFocus {...field} />
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
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
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {apiError && (
              <p className="text-sm text-destructive">{apiError}</p>
            )}

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
                    Creating...
                  </>
                ) : (
                  "Create Trip"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
