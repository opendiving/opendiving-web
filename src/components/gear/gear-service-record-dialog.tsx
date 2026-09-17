"use client";

import { useEffect, useState } from "react";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { FormApiError } from "@/components/ui/form-api-error";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Save } from "lucide-react";
import {
  gearServiceRecordSchema,
  type GearServiceRecordInput,
} from "@/lib/validations/gear-service";
import {
  gearServiceAPI,
  SERVICE_KINDS,
  serviceKindLabel,
  type GearServiceRecord,
  type GearServiceScheduleSummary,
  type ServiceKind,
} from "@/lib/api/gear-service";
import { todayIsoDate } from "@/lib/gear-service";
import { getApiErrorMessage } from "@/lib/api/error";
import { dialogFormSubmit } from "@/lib/dialog-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";

interface GearServiceRecordDialogProps {
  // The item the service belongs to. Its uuid is all this dialog needs of it, and taking
  // only that is what lets the dashboard's service-due card open it from a row that
  // carries an item's identity without ever having fetched the item.
  gearItemUuid: string;
  // How to name that item, when the surface that opened this can't. The gear detail page
  // is titled with the item already, so it passes nothing; the dashboard's card spans
  // every item a diver owns, and a bare "Log Service" there would not say which one.
  gearItemLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The rule this service satisfies, when the dialog was opened from one. Prefills the
  // type and label; the API infers the same link server-side when it isn't sent. The
  // summary rather than the full schedule, because the three fields read here - uuid,
  // kind, label - are all the dashboard's due entry can offer.
  schedule?: GearServiceScheduleSummary | null;
  // Pass an existing record to edit it; omit to log a new one.
  record?: GearServiceRecord | null;
  onSaved: () => void;
}

// "Log service" dialog. Logging against a schedule resets its due date and re-arms its
// reminder; logging without one is still useful (a hydro stamp on a cylinder you never
// set a reminder for) and simply stands on its own in the history.
export function GearServiceRecordDialog({
  gearItemUuid,
  gearItemLabel,
  open,
  onOpenChange,
  schedule,
  record,
  onSaved,
}: GearServiceRecordDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useDialogApiError(open);
  const isEdit = !!record;

  const form = useForm<GearServiceRecordInput>({
    resolver: zodResolver(gearServiceRecordSchema),
    defaultValues: {
      kind: "service",
      label: "",
      serviced_on: "",
      performed_by: "",
      notes: "",
    },
  });

  const { reset } = form;
  useEffectOnChange(() => {
    if (!open) return;
    reset({
      kind: record?.kind ?? schedule?.kind ?? "service",
      label: record?.label ?? schedule?.label ?? "",
      // Defaults to today: the overwhelmingly common case is logging work just done.
      serviced_on: record?.serviced_on ?? todayIsoDate(),
      performed_by: record?.performed_by ?? "",
      notes: record?.notes ?? "",
    });
  }, [open, record, schedule, reset]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setApiError(null);
    onOpenChange(next);
  };

  const onSubmit = async (data: GearServiceRecordInput) => {
    setApiError(null);
    try {
      setIsSubmitting(true);

      if (record) {
        await gearServiceAPI.updateRecord(record.uuid, {
          kind: data.kind,
          label: data.label || null,
          serviced_on: data.serviced_on,
          performed_by: data.performed_by || null,
          notes: data.notes || "",
        });
      } else {
        await gearServiceAPI.createRecord({
          gear_item_uuid: gearItemUuid,
          kind: data.kind,
          label: data.label || undefined,
          serviced_on: data.serviced_on,
          performed_by: data.performed_by || undefined,
          notes: data.notes || undefined,
          // Sent when the dialog was opened from a specific rule. When it wasn't, the
          // API links the one schedule matching (item, kind, label) itself.
          gear_service_schedule_uuid: schedule?.uuid,
        });
      }

      onSaved();
      onOpenChange(false);
    } catch (error) {
      setApiError(
        getApiErrorMessage(
          error,
          `Failed to ${isEdit ? "update" : "log"} service. Please try again.`,
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
          <DialogTitle>{isEdit ? "Edit Service" : "Log Service"}</DialogTitle>
          {gearItemLabel && (
            <DialogDescription>{gearItemLabel}</DialogDescription>
          )}
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service type *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SERVICE_KINDS.map((kind: ServiceKind) => (
                        <SelectItem key={kind} value={kind}>
                          {serviceKindLabel(kind)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="serviced_on"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Serviced on *</FormLabel>
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
              name="performed_by"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Serviced by</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Blue Ocean Dive Resort"
                      {...field}
                      value={field.value ?? ""}
                    />
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
                      placeholder="Parts replaced, cost, test pressure..."
                      className="min-h-[80px]"
                      {...field}
                      value={field.value ?? ""}
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
                    {isEdit ? "Saving..." : "Logging..."}
                  </>
                ) : isEdit ? (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save changes
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Log service
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
