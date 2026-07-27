"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { diveSitesAPI } from "@/lib/api/dive-sites";
import { diveSiteCreateSchema, DiveSiteCreateInput } from "@/lib/validations/dive-site";
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

export default function NewDiveSitePage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<DiveSiteCreateInput>({
    resolver: zodResolver(diveSiteCreateSchema),
    defaultValues: {
      name: "",
      location: "",
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

  const onSubmit = async (data: DiveSiteCreateInput) => {
    if (!user?.username) return;

    try {
      setIsSubmitting(true);

      await diveSitesAPI.createDiveSite(user.username, data);

      toast({
        title: "Success",
        description: "Dive site created successfully!",
      });

      router.push('/sites');
    } catch (error: any) {
      console.error('Failed to create dive site:', error);

      const errorMessage = getApiErrorMessage(error, "Failed to create dive site. Please try again.");

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
          <Link href="/sites">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dive Sites
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">New Dive Site</h1>
          <p className="text-muted-foreground mt-1">
            Add a dive site to log your dives at
          </p>
        </div>
      </div>

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

              <div className="flex justify-end gap-4 pt-4">
                <Button type="button" variant="outline" asChild>
                  <Link href="/sites">Cancel</Link>
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating Dive Site...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Create Dive Site
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
