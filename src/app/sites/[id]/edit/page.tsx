"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import {
  diveSiteUpdateSchema,
  DiveSiteUpdateInput,
} from "@/lib/validations/dive-site";
import { getApiErrorMessage } from "@/lib/api/error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { PageSpinner } from "@/components/ui/page-spinner";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { NotFoundState } from "@/components/ui/not-found-state";
import { Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

export default function EditDiveSitePage() {
  const params = useParams();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const router = useRouter();
  const { toast } = useToast();
  const [diveSite, setDiveSite] = useState<DiveSite | null>(null);
  const [isLoadingDiveSite, setIsLoadingDiveSite] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const diveSiteId = params.id as string;

  const form = useForm<DiveSiteUpdateInput>({
    resolver: zodResolver(diveSiteUpdateSchema),
    defaultValues: {
      name: "",
      location: "",
      notes: "",
    },
  });

  // Fetch dive site details and populate form
  useEffect(() => {
    const fetchDiveSite = async () => {
      if (!user || !diveSiteId) return;

      try {
        setIsLoadingDiveSite(true);
        const diveSiteData = await diveSitesAPI.getDiveSite(diveSiteId);
        setDiveSite(diveSiteData);

        form.reset({
          name: diveSiteData.name,
          location: diveSiteData.location ?? "",
          notes: diveSiteData.notes ?? "",
        });
      } catch (error) {
        console.error("Failed to fetch dive site:", error);
        toast({
          title: "Error",
          description: "Failed to load dive site details. Please try again.",
          variant: "destructive",
        });
        router.push("/sites");
      } finally {
        setIsLoadingDiveSite(false);
      }
    };

    if (user) {
      fetchDiveSite();
    }
  }, [user, diveSiteId, form, toast, router]);

  const onSubmit = async (data: DiveSiteUpdateInput) => {
    if (!user || !diveSiteId) return;

    try {
      setIsSubmitting(true);

      await diveSitesAPI.updateDiveSite(diveSiteId, data);

      toast({
        title: "Success",
        description: "Dive site updated successfully!",
      });

      router.push("/sites");
    } catch (error: any) {
      console.error("Failed to update dive site:", error);

      const errorMessage = getApiErrorMessage(
        error,
        "Failed to update dive site. Please try again.",
      );

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
    return <PageSpinner />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingDiveSite) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionSpinner />
      </div>
    );
  }

  if (!diveSite) {
    return (
      <div className="container mx-auto px-4 py-8">
        <NotFoundState
          message="Dive site not found."
          backHref="/sites"
          backLabel="Back to Dive Sites"
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <PageHeader
        backHref="/sites"
        backLabel="Back to Dive Sites"
        title="Edit Dive Site"
        subtitle="Update the dive site details"
      />

      <Card>
        <CardHeader>
          <CardTitle>Dive Site Details</CardTitle>
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
                      <Input placeholder="e.g. Blue Hole" {...field} />
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

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any notes about this dive site..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4 pt-4">
                <Button type="button" variant="outline" asChild>
                  <Link href="/sites">Cancel</Link>
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating Dive Site...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Update Dive Site
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
