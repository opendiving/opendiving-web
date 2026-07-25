"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { divesAPI, Dive } from "@/lib/api/dives";
import { diveUpdateSchema, DiveUpdateInput } from "@/lib/validations/dive";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export default function EditDivePage() {
  const params = useParams();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [dive, setDive] = useState<Dive | null>(null);
  const [isLoadingDive, setIsLoadingDive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const diveId = parseInt(params.id as string);

  const form = useForm<DiveUpdateInput>({
    resolver: zodResolver(diveUpdateSchema),
    defaultValues: {
      dive_number: undefined,
      start_time: "",
      duration: undefined,
      max_depth: undefined,
      avg_depth: undefined,
      bottom_temperature: undefined,
      visibility: undefined,
      notes: "",
    },
  });

  // Redirect to signin if not authenticated, but only once the auth check
  // has actually finished.
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/signin');
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // Fetch dive details and populate form
  useEffect(() => {
    const fetchDive = async () => {
      if (!user?.username || !diveId) return;

      try {
        setIsLoadingDive(true);
        const diveData = await divesAPI.getDive(user.username, diveId);
        setDive(diveData);

        // Convert datetime strings to YYYY-MM-DD HH:mm:ss for display/editing
        const formatForDateTimeLocal = (dateString: string) => {
          const date = new Date(dateString);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        };

        // Update form with dive data
        form.reset({
          dive_number: diveData.dive_number,
          start_time: formatForDateTimeLocal(diveData.start_time),
          duration: diveData.duration,
          max_depth: diveData.max_depth,
          avg_depth: diveData.avg_depth,
          bottom_temperature: diveData.bottom_temperature,
          visibility: diveData.visibility,
          notes: diveData.notes || "",
        });
      } catch (error) {
        console.error('Failed to fetch dive:', error);
        toast({
          title: "Error",
          description: "Failed to load dive details. Please try again.",
          variant: "destructive",
        });
        router.push('/dives');
      } finally {
        setIsLoadingDive(false);
      }
    };

    if (user?.username) {
      fetchDive();
    }
  }, [user?.username, diveId, form, toast, router]);

  const onSubmit = async (data: DiveUpdateInput) => {
    if (!user?.username || !diveId) return;

    try {
      setIsSubmitting(true);

      // Filter out undefined values and format dates
      const updateData: any = {};

      if (data.dive_number !== undefined) {
        updateData.dive_number = data.dive_number;
      }

      if (data.start_time) {
        updateData.start_time = new Date(data.start_time.replace(" ", "T")).toISOString();
      }

      if (data.duration !== undefined) {
        updateData.duration = data.duration;
      }

      if (data.max_depth !== undefined) {
        updateData.max_depth = data.max_depth;
      }

      if (data.avg_depth !== undefined) {
        updateData.avg_depth = data.avg_depth;
      }

      if (data.bottom_temperature !== undefined) {
        updateData.bottom_temperature = data.bottom_temperature;
      }

      if (data.visibility !== undefined) {
        updateData.visibility = data.visibility;
      }

      if (data.notes !== undefined) {
        updateData.notes = data.notes;
      }

      await divesAPI.updateDive(user.username, diveId, updateData);

      toast({
        title: "Success",
        description: "Dive updated successfully!",
      });

      router.push(`/dives/${diveId}`);
    } catch (error: any) {
      console.error('Failed to update dive:', error);

      let errorMessage = "Failed to update dive. Please try again.";
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      }

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

  if (isLoadingDive) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!dive) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="text-muted-foreground mb-4">
            Dive not found.
          </div>
          <Button asChild>
            <Link href="/dives">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dives
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
          <Link href={`/dives/${diveId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dive
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Edit Dive #{dive.dive_number}</h1>
          <p className="text-muted-foreground mt-1">
            Update the details of your dive
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dive Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dive_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dive Number</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Date and Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                      <FormControl>
                        <DateTimePicker
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
                  name="duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration (minutes)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          placeholder="e.g. 45"
                          value={field.value ? Math.round(field.value / 60) : ""}
                          onChange={(e) => {
                            const minutes = parseInt(e.target.value);
                            field.onChange(Number.isNaN(minutes) ? undefined : minutes * 60);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Depth Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="max_depth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum Depth (m)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="e.g. 30.52"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="avg_depth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Average Depth (m)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="e.g. 18.24"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Temperature & Visibility */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bottom_temperature"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bottom Temperature (°C)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="-50"
                          max="50"
                          placeholder="e.g. 22"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="visibility"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Visibility (m)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="e.g. 15"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter any additional notes about your dive..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Submit Button */}
              <div className="flex justify-end gap-4 pt-4">
                <Button type="button" variant="outline" asChild>
                  <Link href={`/dives/${diveId}`}>Cancel</Link>
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating Dive...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Update Dive
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
