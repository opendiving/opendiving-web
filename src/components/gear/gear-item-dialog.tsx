"use client";

import { useDialogApiError } from "@/hooks/useDialogApiError";
import { NativeSelect } from "@/components/ui/native-select";
import { FormApiError } from "@/components/ui/form-api-error";
import { useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { gearItemSchema, GearItemInput } from "@/lib/validations/gear";
import {
  CYLINDER_MATERIALS,
  cylinderMaterialLabel,
  gearAPI,
  GearItem,
  GearType,
  GEAR_TYPES,
  gearTypeLabel,
  type CylinderMaterial,
} from "@/lib/api/gear";
import { getApiDuplicateError, getApiErrorMessage } from "@/lib/api/error";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { DialogSubmitButton } from "@/components/ui/dialog-submit-button";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";
import { VolumeCombobox } from "@/components/dives/volume-combobox";
import { UnitNumberInput } from "@/components/unit-number-input";
import { useUnits } from "@/hooks/useUnits";
import { unitLabel } from "@/lib/units";

interface GearItemDialogProps {
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
  // Presets the type of a new item - a tank's cylinder picker opens it as a cylinder.
  initialType?: GearType;
}

const CYLINDER: GearType = "cylinder";

/**
 * The vessel facts a save sends, given the type it saves and the type the item had.
 *
 * The fields are on screen only for a cylinder, so that is the one case the form's
 * values are sent. An item this edit moved away from `cylinder` sends `null` for all
 * three, keeping no capacity nobody can see; any other item leaves them as stored
 * (omitted from the PATCH), so renaming an untyped item whose import carried facts
 * keeps them. A new item that is not a cylinder sends none.
 */
export function vesselFactsToSave(
  data: Pick<GearItemInput, "volume" | "working_pressure" | "material">,
  savedType: GearType | null,
  storedType: GearType | null | undefined,
): {
  volume?: number | null;
  working_pressure?: number | null;
  material?: CylinderMaterial | null;
} {
  if (savedType === CYLINDER) {
    return {
      volume: data.volume === "" ? null : (data.volume ?? null),
      working_pressure: data.working_pressure ?? null,
      material: data.material ? data.material : null,
    };
  }
  if (storedType === CYLINDER) {
    return { volume: null, working_pressure: null, material: null };
  }
  return {};
}

// Create/edit dialog for a single gear item, used both by the gear management
// page and by the dive form's pickers - a dialog is less disruptive than navigating
// away from a half-filled dive form to a dedicated page and back.
export function GearItemDialog({
  open,
  onOpenChange,
  gearItem,
  onSaved,
  initialName,
  initialType,
}: GearItemDialogProps) {
  const [apiError, setApiError, handleOpenChange] = useDialogApiError(
    open,
    onOpenChange,
  );
  const isEdit = !!gearItem;

  const form = useForm<GearItemInput>({
    resolver: zodResolver(gearItemSchema),
    defaultValues: {
      name: "",
      brand: "",
      type: "",
      notes: "",
      rented: false,
      volume: "",
      working_pressure: null,
      material: "",
    },
  });
  const isCylinder =
    useWatch({ control: form.control, name: "type" }) === CYLINDER;

  // Reload the form whenever the dialog is opened, so it shows the item being
  // edited (or a clean slate prefilled with the picker's typed text) rather than
  // whatever the previous invocation left behind.
  const { reset, setError, setFocus } = form;
  useEffectOnChange(() => {
    if (!open) return;
    reset({
      name: gearItem?.name ?? initialName ?? "",
      brand: gearItem?.brand ?? "",
      type: gearItem ? (gearItem.type ?? "") : (initialType ?? ""),
      notes: gearItem?.notes ?? "",
      rented: gearItem?.rented ?? false,
      volume: gearItem?.volume ?? "",
      working_pressure: gearItem?.working_pressure ?? null,
      material: (gearItem?.material as CylinderMaterial | null) ?? "",
    });
  }, [open, gearItem, initialName, initialType, reset]);

  const onSubmit = async (data: GearItemInput) => {
    setApiError(null);
    try {
      // "" is the form's "not set" state for both of these; on update they go as
      // an explicit null so clearing one actually clears it rather than being
      // ignored as an omitted key, and on create they're simply left off.
      const type = (data.type || null) as GearType | null;
      const vessel = vesselFactsToSave(data, type, gearItem?.type);

      if (gearItem) {
        await gearAPI.updateGearItem(gearItem.uuid, {
          name: data.name.trim(),
          brand: data.brand?.trim() || null,
          type,
          notes: data.notes || "",
          rented: data.rented ?? false,
          ...vessel,
        });
        onSaved({
          ...gearItem,
          name: data.name.trim(),
          brand: data.brand?.trim() || null,
          type,
          notes: data.notes || "",
          rented: data.rented ?? false,
          ...vessel,
        });
      } else {
        const created = await gearAPI.createGearItem({
          name: data.name.trim(),
          brand: data.brand?.trim() || undefined,
          type: type ?? undefined,
          notes: data.notes || undefined,
          rented: data.rented ?? false,
          ...vessel,
        });
        onSaved(created);
      }

      onOpenChange(false);
    } catch (error) {
      // A name already taken is shown on the name, beside what the diver typed.
      const duplicate = getApiDuplicateError(error);
      if (duplicate) {
        setError("name", { message: duplicate });
        setFocus("name");
        return;
      }
      setApiError(
        getApiErrorMessage(
          error,
          `Failed to ${isEdit ? "update" : "create"} gear. Please try again.`,
        ),
      );
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
                  <FormControl
                    render={
                      <Input placeholder="e.g. MK25 EVO" autoFocus {...field} />
                    }
                  />
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
                  <FormControl
                    render={
                      <Input
                        placeholder="e.g. Scubapro"
                        {...field}
                        value={field.value ?? ""}
                      />
                    }
                  />
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
                  <FormControl
                    render={
                      <NativeSelect {...field} value={field.value ?? ""} />
                    }
                  >
                    <option value="">No type</option>
                    {GEAR_TYPES.map((gearType) => (
                      <option key={gearType} value={gearType}>
                        {gearTypeLabel(gearType)}
                      </option>
                    ))}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* The dialog's one type-conditional block: a cylinder's facts are
                recorded once here and copied onto the tanks that link it. */}
            {isCylinder && <CylinderFactFields control={form.control} />}

            <FormField
              control={form.control}
              name="rented"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormControl
                      render={
                        <Switch
                          id="gear-rented"
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                        />
                      }
                    />
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
                  <FormControl
                    render={
                      <Textarea
                        placeholder="Serial number, service dates, sizing..."
                        className="min-h-[80px]"
                        {...field}
                        value={field.value ?? ""}
                      />
                    }
                  />
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
              <DialogSubmitButton isEdit={isEdit} createLabel="Create gear" />
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// A cylinder's three facts. Its own component so only a dialog showing them reads the
// diver's units, which the pressure box converts.
function CylinderFactFields({ control }: { control: Control<GearItemInput> }) {
  const units = useUnits();
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="volume"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Volume (L)</FormLabel>
              <FormControl
                render={
                  <VolumeCombobox
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="e.g. 11.1"
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="working_pressure"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Working pressure ({unitLabel("pressure", units)})
              </FormLabel>
              <FormControl
                render={
                  <UnitNumberInput
                    dimension="pressure"
                    units={units}
                    min={0}
                    placeholderValue={232}
                    {...field}
                    value={field.value}
                    onChange={field.onChange}
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={control}
        name="material"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Material</FormLabel>
            <FormControl
              render={<NativeSelect {...field} value={field.value ?? ""} />}
            >
              <option value="">Not recorded</option>
              {CYLINDER_MATERIALS.map((material) => (
                <option key={material} value={material}>
                  {cylinderMaterialLabel(material)}
                </option>
              ))}
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
