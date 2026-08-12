"use client";

import {
  Control,
  FieldValues,
  Path,
  UseFieldArrayReturn,
  useFieldArray,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Plus, Trash2 } from "lucide-react";
import { DiveMixtureInput } from "@/lib/validations/dive";
import { DEFAULT_MIXTURE, getDefaultMixtureName } from "@/lib/dive-mixtures";
import { VolumeCombobox } from "@/components/dives/volume-combobox";

export { DEFAULT_MIXTURE, getDefaultMixtureName };

// The minimal field shape `MixtureFields` needs: any form values type that
// has a `mixtures` array (both `DiveCreateInput` and `DiveUpdateInput` from
// `lib/validations/dive.ts` qualify). Keeping this generic - rather than
// falling back to `Control<any, any, any>` - preserves type safety between
// the create/update form shapes at the `control` prop boundary.
export interface MixtureFieldsValues extends FieldValues {
  mixtures?: DiveMixtureInput[];
}

// The `useFieldArray` return type for `mixtures`, keyed to `MixtureFieldsValues`
// rather than any particular concrete form type. Exported so a single instance
// can be created once at a common ancestor (the create/edit dive pages) and
// passed down to both `MixtureFields` and `DiveFileImport` - `useFieldArray`
// doesn't reliably keep multiple separate instances watching the same
// `control`/`name` in sync with each other (e.g. `replace()` called on one
// instance doesn't shrink another instance's `fields` when the new array is
// shorter - see DECISIONS.md), so there must only ever be one.
export type MixtureFieldArray = UseFieldArrayReturn<
  MixtureFieldsValues,
  "mixtures"
>;

// Creates the single `mixtures` field array instance a page needs, already
// cast to `MixtureFieldArray` - pass `form.control` in directly. Call this
// once per form, at the same level as the `useForm()` call, and pass the
// result down to both `DiveFormFields`/`MixtureFields` and `DiveFileImport`
// (e.g. via `DiveFormCard`) - see `MixtureFieldArray`'s doc comment above for
// why there must only ever be one instance per form.
export function useMixtureFieldArray<TFieldValues extends MixtureFieldsValues>(
  control: Control<TFieldValues>,
): MixtureFieldArray {
  // Narrowing `control` to `MixtureFieldsValues` is sound: it's exactly the
  // shape `TFieldValues` is constrained to extend, and only affects this
  // hook's internal typing, not what callers pass in.
  return useFieldArray<MixtureFieldsValues, "mixtures">({
    control: control as unknown as Control<MixtureFieldsValues>,
    name: "mixtures",
  });
}

export interface MixtureFieldsProps<TFieldValues extends MixtureFieldsValues> {
  control: Control<TFieldValues>;
  fieldArray: MixtureFieldArray;
}

export function MixtureFields<TFieldValues extends MixtureFieldsValues>({
  control,
  fieldArray,
}: MixtureFieldsProps<TFieldValues>) {
  const { fields, append, remove } = fieldArray;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Gas Mixtures</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            append({
              ...DEFAULT_MIXTURE,
              name: getDefaultMixtureName(fields.length),
            })
          }
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Mixture
        </Button>
      </div>

      {fields.map((field, index) => (
        <div key={field.id} className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Tank {index + 1}
            </span>
            {index > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(index)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name={`mixtures.${index}.name` as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="e.g. Back Gas"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name={`mixtures.${index}.volume` as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Volume (L)</FormLabel>
                  <FormControl>
                    <VolumeCombobox
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name={`mixtures.${index}.oxygen` as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>O₂ (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        // An emptied box is `undefined`, never `NaN`. Unlike
                        // the pressures below - which are optional and use ""
                        // as their placeholder - O2/He are required numbers, so
                        // `undefined` gets the schema's "required" message
                        // instead of a "expected number, received nan" one, and
                        // `value ?? ""` keeps React from warning about a NaN
                        // value attribute in the meantime.
                        const raw = e.target.value;
                        field.onChange(
                          raw === "" ? undefined : parseFloat(raw),
                        );
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name={`mixtures.${index}.helium` as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>He (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        // An emptied box is `undefined`, never `NaN`. Unlike
                        // the pressures below - which are optional and use ""
                        // as their placeholder - O2/He are required numbers, so
                        // `undefined` gets the schema's "required" message
                        // instead of a "expected number, received nan" one, and
                        // `value ?? ""` keeps React from warning about a NaN
                        // value attribute in the meantime.
                        const raw = e.target.value;
                        field.onChange(
                          raw === "" ? undefined : parseFloat(raw),
                        );
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name={`mixtures.${index}.start_pressure` as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start pressure (bar)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        field.onChange(raw === "" ? "" : parseFloat(raw));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name={`mixtures.${index}.end_pressure` as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End pressure (bar)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        field.onChange(raw === "" ? "" : parseFloat(raw));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
