"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { gearSetSchema, GearSetInput } from "@/lib/validations/gear";
import { gearAPI, GearSet, fetchAllGearSets } from "@/lib/api/gear";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { GearItemMultiSelect } from "@/components/gear/gear-item-multi-select";

// Sentinel for the "Create a new set" option in the target picker. Radix's
// `SelectItem` can't take an empty string value, so a real (uuid-shaped-free)
// marker is used instead of `""`.
const NEW_SET_VALUE = "__new__";

interface GearSetDialogProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pass an existing set to edit it in place (gear page). Omit to create one.
  gearSet?: GearSet | null;
  // Items to prefill the set with - this is how the dive form's "Save as set"
  // hands over whatever gear is currently on the dive.
  initialItemUuids?: string[];
  // Shows a "Save to" picker offering the user's existing sets alongside
  // "Create a new set". Used from the dive form, where the items are known but
  // their destination isn't. Ignored when editing a specific `gearSet`.
  allowChoosingTarget?: boolean;
  onSaved: (gearSet: GearSet) => void;
}

// Create/edit dialog for a gear set. Doubles as the dive form's "Save as set"
// sheet: same form, but prefilled with the dive's gear and with a picker for
// whether to overwrite an existing set or start a new one.
export function GearSetDialog({
  userId,
  open,
  onOpenChange,
  gearSet,
  initialItemUuids,
  allowChoosingTarget = false,
  onSaved,
}: GearSetDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [existingSets, setExistingSets] = useState<GearSet[]>([]);
  // uuid of the set being overwritten, or `undefined` while creating a new one.
  const [targetUuid, setTargetUuid] = useState<string | undefined>(undefined);

  const showTargetPicker = allowChoosingTarget && !gearSet;
  const isEdit = !!gearSet || targetUuid !== undefined;

  const form = useForm<GearSetInput>({
    resolver: zodResolver(gearSetSchema),
    defaultValues: { name: "", gear_item_uuids: [] },
  });
  const { reset, setValue } = form;

  // Reset to the dialog's inputs every time it opens, so a previous invocation's
  // half-filled state never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    reset({
      name: gearSet?.name ?? "",
      gear_item_uuids:
        initialItemUuids ?? gearSet?.gear_items.map((i) => i.uuid) ?? [],
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTargetUuid(undefined);
    setApiError(null);
  }, [open, gearSet, initialItemUuids, reset]);

  // The target picker needs the user's sets; only fetched when it's actually shown.
  useEffect(() => {
    if (!open || !showTargetPicker || !userId) return;
    let cancelled = false;

    fetchAllGearSets(userId)
      .then((sets) => {
        if (!cancelled) setExistingSets(sets);
      })
      .catch((error) => console.error("Failed to fetch gear sets:", error));

    return () => {
      cancelled = true;
    };
  }, [open, showTargetPicker, userId]);

  // Picking an existing set only decides *where* the items are saved - the items
  // themselves stay as they came in from the dive form. The name field follows
  // the target so the user can see (and still rename) what they're overwriting.
  const handleTargetChange = (next: string) => {
    if (next === NEW_SET_VALUE) {
      setTargetUuid(undefined);
      setValue("name", "");
      return;
    }
    setTargetUuid(next);
    setValue("name", existingSets.find((s) => s.uuid === next)?.name ?? "");
  };

  const onSubmit = async (data: GearSetInput) => {
    setApiError(null);
    const items = data.gear_item_uuids ?? [];
    const saveToUuid = gearSet?.uuid ?? targetUuid;

    try {
      setIsSubmitting(true);

      if (saveToUuid) {
        await gearAPI.updateGearSet(saveToUuid, {
          name: data.name,
          gear_item_uuids: items,
        });
        // The API returns only a status message on PATCH, so re-read the set to
        // hand the caller its actual saved shape (including the item summaries).
        onSaved(await gearAPI.getGearSet(saveToUuid));
      } else {
        onSaved(
          await gearAPI.createGearSet({
            user_uuid: userId,
            name: data.name,
            gear_item_uuids: items,
          }),
        );
      }

      onOpenChange(false);
    } catch (error: any) {
      setApiError(
        getApiErrorMessage(error, "Failed to save gear set. Please try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {gearSet
              ? "Edit Gear Set"
              : showTargetPicker
                ? "Save as Set"
                : "New Gear Set"}
          </DialogTitle>
          {showTargetPicker && (
            <DialogDescription>
              Save the gear from this dive as a set you can reuse later. The
              dive itself is not linked to the set.
            </DialogDescription>
          )}
        </DialogHeader>

        <Form {...form}>
          {/* `dialogFormSubmit` keeps this submit from bubbling into the dive
              form this dialog is opened from - see `lib/dialog-form.ts`. */}
          <form
            onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
            className="space-y-4"
          >
            {showTargetPicker && (
              <div className="space-y-2">
                <Label htmlFor="gear-set-target">Save to</Label>
                <Select
                  value={targetUuid ?? NEW_SET_VALUE}
                  onValueChange={handleTargetChange}
                >
                  <SelectTrigger id="gear-set-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_SET_VALUE}>
                      Create a new set
                    </SelectItem>
                    {existingSets.map((set) => (
                      <SelectItem key={set.uuid} value={set.uuid}>
                        {set.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {targetUuid !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    This replaces everything currently in that set.
                  </p>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Set Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Sidemount, Warm water rec"
                      autoFocus={!showTargetPicker}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gear_item_uuids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gear</FormLabel>
                  <FormControl>
                    <GearItemMultiSelect
                      userId={userId}
                      value={field.value ?? []}
                      onChange={field.onChange}
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
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : isEdit ? (
                  "Save Set"
                ) : (
                  "Create Set"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
