"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { divesAPI, ParsedDive } from "@/lib/api/dives";
import { diveCreateSchema, DiveCreateInput } from "@/lib/validations/dive";
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
import { ArrowLeft, Loader2, Save, Upload } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

// Get current date/time formatted as YYYY-MM-DD HH:mm:ss
function getCurrentDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Convert a parsed dive's start time (ISO-ish, e.g. "2021-04-06T12:31:34.45")
// into the YYYY-MM-DD HH:mm:ss format used by the form.
function formatParsedStartTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export default function NewDivePage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<DiveCreateInput>({
    resolver: zodResolver(diveCreateSchema),
    defaultValues: {
      dive_number: 1,
      start_time: getCurrentDateTime(),
      duration: undefined,
      max_depth: undefined,
      avg_depth: undefined,
      bottom_temperature: undefined,
      notes: "",
    },
  });

  // Redirect to signin if not authenticated, but only once the auth check has
  // actually finished — otherwise a page refresh always looks "unauthenticated"
  // for a moment and would incorrectly bounce the user away.
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/signin');
    }
  }, [isAuthenticated, isAuthLoading, router]);

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

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsParsingFile(true);
      const parsed: ParsedDive = await divesAPI.parseDiveFile(file);

      if (parsed.dive_number != null) {
        form.setValue("dive_number", parsed.dive_number, { shouldValidate: true, shouldDirty: true });
      }
      if (parsed.start_time) {
        form.setValue("start_time", formatParsedStartTime(parsed.start_time), {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
      if (parsed.duration != null) {
        form.setValue("duration", parsed.duration, { shouldValidate: true, shouldDirty: true });
      }
      if (parsed.max_depth != null) {
        form.setValue("max_depth", parsed.max_depth, { shouldValidate: true, shouldDirty: true });
      }
      if (parsed.avg_depth != null) {
        form.setValue("avg_depth", parsed.avg_depth, { shouldValidate: true, shouldDirty: true });
      }
      if (parsed.bottom_temperature != null) {
        form.setValue("bottom_temperature", Math.round(parsed.bottom_temperature), {
          shouldValidate: true,
          shouldDirty: true,
        });
      }

      toast({
        title: "Dive file parsed",
        description: "Form fields have been filled in from the uploaded file. Please review before saving.",
      });
    } catch (error: any) {
      console.error('Failed to parse dive file:', error);

      let errorMessage = "Failed to parse the dive file. Please check the file and try again.";
      if (typeof error.response?.data?.detail === "string") {
        errorMessage = error.response.data.detail;
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsParsingFile(false);
      e.target.value = "";
    }
  };

  const onSubmit = async (data: DiveCreateInput) => {
    if (!user?.username) return;

    try {
      setIsSubmitting(true);

      // Convert form data to API format
      const diveData = {
        ...data,
        start_time: new Date(data.start_time.replace(" ", "T")).toISOString(),
        notes: data.notes || "",
      };

      await divesAPI.createDive(user.username, diveData);

      toast({
        title: "Success",
        description: "Dive logged successfully!",
      });

      router.push('/dives');
    } catch (error: any) {
      console.error('Failed to create dive:', error);

      let errorMessage = "Failed to log dive. Please try again.";
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dives">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dives
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Log New Dive</h1>
          <p className="text-muted-foreground mt-1">
            Record the details of your dive
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
              {/* Import from dive computer file */}
              <div className="rounded-lg border border-dashed p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-muted/40">
                <div>
                  <p className="font-medium text-sm">Import from a dive computer file</p>
                  <p className="text-sm text-muted-foreground">
                    Upload a dive log export (e.g. Suunto XML) to automatically fill in the fields below.
                  </p>
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xml"
                    className="hidden"
                    onChange={handleFileSelected}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isParsingFile}
                  >
                    {isParsingFile ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Parsing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Dive File
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dive_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dive Number *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
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
                      <FormLabel>Start Time *</FormLabel>
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
                      <FormLabel>Duration (minutes) *</FormLabel>
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

              {/* Temperature */}
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
                  <Link href="/dives">Cancel</Link>
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Logging Dive...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Log Dive
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
