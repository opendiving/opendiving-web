"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import {
  diveSiteCreateSchema,
  DiveSiteCreateInput,
} from "@/lib/validations/dive-site";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
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

interface NewDiveSiteDialogProps {
  userId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (diveSite: DiveSite) => void;
}

export function NewDiveSiteDialog({
  userId,
  open,
  onOpenChange,
  onCreated,
}: NewDiveSiteDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const form = useForm<DiveSiteCreateInput>({
    resolver: zodResolver(diveSiteCreateSchema),
    defaultValues: { name: "", location: "", notes: "" },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset();
      setApiError(null);
    }
    onOpenChange(next);
  };

  const onSubmit = async (data: DiveSiteCreateInput) => {
    setApiError(null);
    try {
      setIsSubmitting(true);
      const newDiveSite = await diveSitesAPI.createDiveSite({
        user_id: userId,
        name: data.name,
        location: data.location || undefined,
        notes: data.notes || undefined,
      });
      form.reset();
      onCreated(newDiveSite);
      onOpenChange(false);
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ??
        "Failed to create dive site. Please try again.";
      setApiError(
        typeof message === "string" ? message : JSON.stringify(message),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Dive Site</DialogTitle>
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
                    Creating...
                  </>
                ) : (
                  "Create Dive Site"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
