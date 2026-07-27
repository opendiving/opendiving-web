"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { tripUpdateSchema, TripUpdateInput, normalizeTripDates } from "@/lib/validations/trip";
import { getApiErrorMessage } from "@/lib/api/error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

export default function EditTripPage() {
  const params = useParams();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [isLoadingTrip, setIsLoadingTrip] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tripId = parseInt(params.id as string);

  const form = useForm<TripUpdateInput>({
    resolver: zodResolver(tripUpdateSchema),
    defaultValues: {
      name: "",
      location: "",
      start_date: "",
      end_date: "",
    },
  });

  // Redirect to signin if not authenticated, but only once the auth check
  // has actually finished.
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/signin');
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // Fetch trip details and populate form
  useEffect(() => {
    const fetchTrip = async () => {
      if (!user?.username || !tripId) return;

      try {
        setIsLoadingTrip(true);
        const tripData = await tripsAPI.getTrip(user.username, tripId);
        setTrip(tripData);

        form.reset({
          name: tripData.name,
          location: tripData.location ?? "",
          start_date: tripData.start_date ?? "",
          end_date: tripData.end_date ?? "",
        });
      } catch (error) {
        console.error('Failed to fetch trip:', error);
        toast({
          title: "Error",
          description: "Failed to load trip details. Please try again.",
          variant: "destructive",
        });
        router.push('/trips');
      } finally {
        setIsLoadingTrip(false);
      }
    };

    if (user?.username) {
      fetchTrip();
    }
  }, [user?.username, tripId, form, toast, router]);

  const onSubmit = async (data: TripUpdateInput) => {
    if (!user?.username || !tripId) return;

    try {
      setIsSubmitting(true);

      await tripsAPI.updateTrip(user.username, tripId, normalizeTripDates(data));

      toast({
        title: "Success",
        description: "Trip updated successfully!",
      });

      router.push('/trips');
    } catch (error: any) {
      console.error('Failed to update trip:', error);

      const errorMessage = getApiErrorMessage(error, "Failed to update trip. Please try again.");

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingTrip) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="text-muted-foreground mb-4">
            Trip not found.
          </div>
          <Button asChild>
            <Link href="/trips">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Trips
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/trips">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Trips
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Edit Trip</h1>
          <p className="text-muted-foreground mt-1">
            Update the trip details
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trip Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Red Sea Liveaboard 2024" {...field} />
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div className="flex justify-end gap-4 pt-4">
                <Button type="button" variant="outline" asChild>
                  <Link href="/trips">Cancel</Link>
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating Trip...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Update Trip
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
