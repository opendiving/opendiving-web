"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import {
  certificationSchema,
  CertificationInput,
} from "@/lib/validations/certification";
import {
  certificationsAPI,
  Certification,
  CertificationAgency,
  CERTIFICATION_AGENCIES,
  certificationAgencyLabel,
} from "@/lib/api/certifications";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";

interface CertificationDialogProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pass an existing certification to edit it; omit to create a new one.
  certification?: Certification | null;
  onSaved: (certification: Certification) => void;
}

// Create/edit dialog for a certification's details. Card images are managed
// separately (see `certification-card-files.tsx`) because they are uploaded
// against a certification that already exists.
//
// A dialog rather than `new`/`edit` pages, following the gear precedent: these
// are a handful of fields typed off a card the diver is holding, not a
// multi-section form like a dive.
export function CertificationDialog({
  userId,
  open,
  onOpenChange,
  certification,
  onSaved,
}: CertificationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const isEdit = !!certification;

  const form = useForm<CertificationInput>({
    resolver: zodResolver(certificationSchema),
    defaultValues: {
      agency: "padi",
      agency_other: "",
      name: "",
      certification_number: "",
      certified_on: "",
      expires_on: "",
      instructor_name: "",
      instructor_number: "",
      training_center: "",
      notes: "",
    },
  });

  // `agency_other` is only shown - and only accepted by the API - for "other".
  // `useWatch` rather than `form.watch()`: the latter returns a fresh function
  // every render that can't be memoized, which the react-hooks lint rules reject.
  const agency = useWatch({ control: form.control, name: "agency" });

  // Reload the form whenever the dialog opens, so it shows the certification
  // being edited rather than whatever the previous invocation left behind.
  const { reset } = form;
  useEffect(() => {
    if (!open) return;
    reset({
      agency: certification?.agency ?? "padi",
      agency_other: certification?.agency_other ?? "",
      name: certification?.name ?? "",
      certification_number: certification?.certification_number ?? "",
      certified_on: certification?.certified_on ?? "",
      expires_on: certification?.expires_on ?? "",
      instructor_name: certification?.instructor_name ?? "",
      instructor_number: certification?.instructor_number ?? "",
      training_center: certification?.training_center ?? "",
      notes: certification?.notes ?? "",
    });
    // Same deliberate reset-on-open pattern as `gear-item-dialog.tsx`; clearing a
    // stale error when the dialog reopens is exactly the "sync to a prop change"
    // case this rule can't distinguish from a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiError(null);
  }, [open, certification, reset]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setApiError(null);
    onOpenChange(next);
  };

  const onSubmit = async (data: CertificationInput) => {
    setApiError(null);
    try {
      setIsSubmitting(true);

      // "" is the form's "not set" state for every optional field. On update they
      // go as an explicit null so clearing one actually clears it rather than
      // being ignored as an omitted key; on create they are simply left off.
      //
      // `agency_other` is the exception: the API rejects a non-null value unless
      // the agency is "other", so switching away from "other" must send null
      // rather than the stale name still sitting in the form state.
      const shared = {
        agency: data.agency as CertificationAgency,
        agency_other:
          data.agency === "other" ? (data.agency_other || null) : null,
        name: data.name,
        certification_number: data.certification_number || null,
        certified_on: data.certified_on || null,
        expires_on: data.expires_on || null,
        instructor_name: data.instructor_name || null,
        instructor_number: data.instructor_number || null,
        training_center: data.training_center || null,
        notes: data.notes || "",
      };

      if (certification) {
        await certificationsAPI.updateCertification(certification.uuid, shared);
        onSaved({ ...certification, ...shared });
      } else {
        const created = await certificationsAPI.createCertification({
          user_uuid: userId,
          ...shared,
        });
        onSaved(created);
      }

      onOpenChange(false);
    } catch (error: any) {
      setApiError(
        getApiErrorMessage(
          error,
          `Failed to ${isEdit ? "update" : "create"} certification. Please try again.`,
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Certification" : "New Certification"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="agency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agency *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CERTIFICATION_AGENCIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {certificationAgencyLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {agency === "other" && (
              <FormField
                control={form.control}
                name="agency_other"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agency name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. FFESSM"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Certification *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Advanced Open Water Diver"
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
              name="certification_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Certification number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="As printed on the card"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="certified_on"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Certified on</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expires_on"
                render={({ field }) => (
                  <FormItem>
                    {/* Most recreational cards never expire; rescue, first-aid
                        and technical ones do. */}
                    <FormLabel>Expires on</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value ?? ""}
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
              name="training_center"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Training center</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Blue Ocean, Koh Tao"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="instructor_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instructor</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instructor_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instructor number</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
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
                      placeholder="Specialties covered, restrictions, anything worth remembering..."
                      className="min-h-[80px]"
                      {...field}
                      value={field.value ?? ""}
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
                  "Save Changes"
                ) : (
                  "Create Certification"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
