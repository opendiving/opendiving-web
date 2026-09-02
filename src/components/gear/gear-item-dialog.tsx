"use client";

import { useEffect, useState } from "react";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { FormApiError } from "@/components/ui/form-api-error";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Save } from "lucide-react";
import { gearItemSchema, GearItemInput } from "@/lib/validations/gear";
import {
  gearAPI,
  GearItem,
  GearType,
  GEAR_TYPES,
  gearTypeLabel,
} from "@/lib/api/gear";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

// Radix's `SelectItem` can't take an empty string value, so "no type" needs a
// real marker in the dropdown - mapped back to `undefined` on save.
const NO_TYPE_VALUE = "__none__";

interface GearItemDialogProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pass an existing item to edit it; omit to create a new one.
  gearItem?: GearItem | null;
  // Called with the created/updated item so the caller can add it to (or refresh)
  // whatever list it's showing - and, in the dive form, select it straight away.
  onSaved: (gearItem: GearItem) => void;
  // Prefills the name field, e.g. with whatever the user had typed into the
  // picker before hitting "Add gear...".
  initialName?: string;
}

// Create/edit dialog for a single gear item, used both by the gear management
// page and by the dive form's picker. Gear has only four fields, so a dialog is
// less disruptive than navigating away from a half-filled dive form to a
// dedicated page and back.
export function GearItemDialog({
  userId,
  open,
  onOpenChange,
  gearItem,
  onSaved,
  initialName,
}: GearItemDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useDialogApiError(open);
  const isEdit = !!gearItem;

  const form = useForm<GearItemInput>({
    resolver: zodResolver(gearItemSchema),
    defaultValues: { name: "", brand: "", type: "", notes: "", rented: false },
  });

  // Reload the form whenever the dialog is opened, so it shows the item being
  // edited (or a clean slate prefilled with the picker's typed text) rather than
  // whatever the previous invocation left behind.
  const { reset } = form;
  useEffect(() => {
    if (!open) return;
    reset({
      name: gearItem?.name ?? initialName ?? "",
      brand: gearItem?.brand ?? "",
      type: gearItem?.type ?? "",
      notes: gearItem?.notes ?? "",
      rented: gearItem?.rented ?? false,
    });
  }, [open, gearItem, initialName, reset]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setApiError(null);
    onOpenChange(next);
  };

  const onSubmit = async (data: GearItemInput) => {
    setApiError(null);
    try {
      setIsSubmitting(true);

      // "" is the form's "not set" state for both of these; on update they go as
      // an explicit null so clearing one actually clears it rather than being
      // ignored as an omitted key, and on create they're simply left off.
      const type = (data.type || null) as GearType | null;

      if (gearItem) {
        await gearAPI.updateGearItem(gearItem.uuid, {
          name: data.name,
          brand: data.brand || null,
          type,
          notes: data.notes || "",
          rented: data.rented ?? false,
        });
        onSaved({
          ...gearItem,
          name: data.name,
          brand: data.brand || null,
          type,
          notes: data.notes || "",
          rented: data.rented ?? false,
        });
      } else {
        const created = await gearAPI.createGearItem({
          user_uuid: userId,
          name: data.name,
          brand: data.brand || undefined,
          type: type ?? undefined,
          notes: data.notes || undefined,
          rented: data.rented ?? false,
        });
        onSaved(created);
      }

      onOpenChange(false);
    } catch (error) {
      setApiError(
        getApiErrorMessage(
          error,
          `Failed to ${isEdit ? "update" : "create"} gear. Please try again.`,
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
          <DialogTitle>{isEdit ? "Edit Gear" : "New Gear"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          {/* `dialogFormSubmit` keeps this submit from bubbling into the dive
              form this dialog is opened from - see `lib/dialog-form.ts`. */}
          <form
            onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. MK25 EVO" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Scubapro"
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
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select
                    value={field.value || NO_TYPE_VALUE}
                    onValueChange={(next) =>
                      field.onChange(next === NO_TYPE_VALUE ? "" : next)
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_TYPE_VALUE}>
                        <span className="text-muted-foreground">No type</span>
                      </SelectItem>
                      {GEAR_TYPES.map((gearType) => (
                        <SelectItem key={gearType} value={gearType}>
                          {gearTypeLabel(gearType)}
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
              name="rented"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox
                        id="gear-rented"
                        checked={!!field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    </FormControl>
                    <FormLabel
                      htmlFor="gear-rented"
                      className="cursor-pointer font-normal"
                    >
                      Rented, not owned
                    </FormLabel>
                  </div>
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
                      placeholder="Serial number, service dates, sizing..."
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
                    {isEdit ? "Saving..." : "Creating..."}
                  </>
                ) : isEdit ? (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Gear
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
