"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import {
  gearServiceScheduleSchema,
  type GearServiceScheduleInput,
} from "@/lib/validations/gear-service";
import {
  gearServiceAPI,
  SERVICE_KINDS,
  serviceKindLabel,
  type GearServiceSchedule,
  type ServiceKind,
} from "@/lib/api/gear-service";
import type { GearItem } from "@/lib/api/gear";
import { defaultSchedulesForGearType, todayIsoDate } from "@/lib/gear-service";
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
import { Button } from "@/components/ui/button";

interface GearServiceScheduleDialogProps {
  gearItem: GearItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pass an existing schedule to edit it; omit to create a new one.
  schedule?: GearServiceSchedule | null;
  onSaved: () => void;
}

// Create/edit dialog for one servicing rule. A dialog rather than a page for the same
// reason gear itself uses one: it's five fields, and it's always reached from the gear
// detail page you want to stay on.
export function GearServiceScheduleDialog({
  gearItem,
  open,
  onOpenChange,
  schedule,
  onSaved,
}: GearServiceScheduleDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const isEdit = !!schedule;

  const form = useForm<GearServiceScheduleInput>({
    resolver: zodResolver(gearServiceScheduleSchema),
    defaultValues: {
      kind: "service",
      label: "",
      starts_on: "",
      interval_months: "",
      interval_dives: "",
    },
  });

  const { reset } = form;
  useEffect(() => {
    if (!open) return;

    if (schedule) {
      reset({
        kind: schedule.kind,
        label: schedule.label ?? "",
        starts_on: schedule.starts_on,
        interval_months: schedule.interval_months ?? "",
        interval_dives: schedule.interval_dives ?? "",
      });
    } else {
      // Prefill from the gear type's usual convention, so adding a rule to a cylinder
      // starts at "visual inspection, 12 months" rather than blank. Conservative
      // starting points only - the diver is expected to change them to whatever their
      // kit and their local rules actually require (see `defaultSchedulesForGearType`).
      const [preset] = defaultSchedulesForGearType(gearItem.type);
      reset({
        kind: preset?.kind ?? "service",
        label: "",
        // "In service since" defaults to today, which is right for kit bought now.
        // For a used cylinder the diver moves it back to the stamped date.
        starts_on: todayIsoDate(),
        interval_months: preset?.interval_months ?? "",
        interval_dives: preset?.interval_dives ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiError(null);
  }, [open, schedule, gearItem.type, reset]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setApiError(null);
    onOpenChange(next);
  };

  const onSubmit = async (data: GearServiceScheduleInput) => {
    setApiError(null);
    // `""` is the form's "not set" for both intervals; the API spells that as an
    // explicit null on a PATCH so an interval can actually be removed rather than
    // being ignored as an omitted key.
    const months =
      data.interval_months === "" ? null : (data.interval_months ?? null);
    const dives =
      data.interval_dives === "" ? null : (data.interval_dives ?? null);

    try {
      setIsSubmitting(true);

      if (schedule) {
        await gearServiceAPI.updateSchedule(schedule.uuid, {
          kind: data.kind,
          label: data.label || null,
          starts_on: data.starts_on,
          interval_months: months,
          interval_dives: dives,
        });
      } else {
        await gearServiceAPI.createSchedule({
          gear_item_uuid: gearItem.uuid,
          kind: data.kind,
          label: data.label || undefined,
          starts_on: data.starts_on,
          interval_months: months,
          interval_dives: dives,
        });
      }

      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      setApiError(
        getApiErrorMessage(
          error,
          `Failed to ${isEdit ? "update" : "create"} service schedule. Please try again.`,
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
          <DialogTitle>
            {isEdit ? "Edit Service Schedule" : "New Service Schedule"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          {/* `dialogFormSubmit` keeps this submit from bubbling into whatever form
              opened the dialog - see `lib/dialog-form.ts`. */}
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
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. First stage"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Optional. Lets one item carry two rules of the same type.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="starts_on"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>In service since *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Counted from until you log a service. For a used cylinder,
                    use the date stamped on it.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="interval_months"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Every (months)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="e.g. 12"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          field.onChange(Number.isNaN(val) ? "" : val);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="interval_dives"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Every (dives)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="e.g. 100"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          field.onChange(Number.isNaN(val) ? "" : val);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Set either or both — whichever comes first is what makes this due.
              These are common starting points, not manufacturer or legal
              advice: check what your kit and your local rules actually require.
            </p>

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
                  "Create Schedule"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
