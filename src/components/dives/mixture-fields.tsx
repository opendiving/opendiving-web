"use client";

import { useEffect, useState } from "react";
import {
  Control,
  FieldValues,
  Path,
  UseFieldArrayReturn,
  useFieldArray,
  useWatch,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input, inputClassName } from "@/components/ui/input";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { DiveMixtureInput } from "@/lib/validations/dive";
import {
  DEFAULT_MIXTURE,
  GAS_ROLE_LABELS,
  PPO2_WORKING,
  diveModWarning,
  gasHintParts,
  getDefaultMixtureName,
} from "@/lib/dive-mixtures";
import { GAS_ROLES } from "@/lib/api/dives";
import { VolumeCombobox } from "@/components/dives/volume-combobox";

export { DEFAULT_MIXTURE, getDefaultMixtureName };

// The minimal field shape `MixtureFields` needs: any form values type that
// has a `mixtures` array (both `DiveCreateInput` and `DiveUpdateInput` from
// `lib/validations/dive.ts` qualify). Keeping this generic - rather than
// falling back to `Control<any, any, any>` - preserves type safety between
// the create/update form shapes at the `control` prop boundary.
//
// `max_depth` is here for the same reason `mixtures` is: `MixtureGasHint` reads it
// to place a mix's END/EAD and to decide whether its MOD has been exceeded. Optional
// because the hint degrades to just the gas name and MOD without it, which is what a
// dive whose depth hasn't been filled in yet should show.
export interface MixtureFieldsValues extends FieldValues {
  mixtures?: DiveMixtureInput[];
  max_depth?: number | null;
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

// What one cylinder's gas works out to, live, under the boxes it was typed into:
// the gas's name, how deep it can be breathed, and - when the dive logs this as its
// only cylinder - how deep it *feels* (END) or decompresses like (EAD).
//
// Its own component rather than inline in the `fields.map()` below because it needs
// three `useWatch` subscriptions per row, and hooks cannot be called from a loop
// body. Watching only these fields - rather than reading `form.watch()` wholesale -
// also keeps a keystroke in the O₂ box from re-rendering every other tank's card.
//
// Renders nothing until there is something true to say. A half-typed O₂ field is
// `undefined`, and a hint that flickers "EAN3" into "EAN32" as the diver types would
// be worse than one that waits.
//
// `isOnlyMixture` gates everything depth-dependent. The name and the MOD are
// properties of the gas alone and always hold; END and EAD are statements about a
// depth this gas was breathed at, which is only known when there is one cylinder to
// breathe. Printing "EAD 22.6 m at 45.91 m" against a deco bottle staged for the
// ascent describes a breath nobody took - see `diveModWarning`.
function MixtureGasHint({
  control,
  index,
  isOnlyMixture,
}: {
  control: Control<MixtureFieldsValues>;
  index: number;
  isOnlyMixture: boolean;
}) {
  const oxygen = useWatch({ control, name: `mixtures.${index}.oxygen` });
  const helium = useWatch({ control, name: `mixtures.${index}.helium` });
  const po2Limit = useWatch({ control, name: `mixtures.${index}.po2_limit` });
  const maxDepth = useWatch({ control, name: "max_depth" });

  // `depth` is null unless this is the only cylinder, which is what keeps END/EAD
  // off a staged deco bottle - `gasHintParts` documents the rule.
  const parts = gasHintParts({
    oxygen,
    helium,
    depth: isOnlyMixture ? maxDepth : null,
    // `""` is the cleared state, not a limit of zero - normalized here so
    // `gasHintParts` deals only in numbers and nulls, the way every other caller
    // hands it values.
    ppO2: po2Limit === "" ? null : po2Limit,
  });
  if (parts.length === 0) return null;

  return <p className="text-xs text-muted-foreground">{parts.join(" · ")}</p>;
}

// How long the gas warning has to hold still before it is announced. Long enough to
// cover typing a two-digit depth without a pause being mistaken for a finished edit.
const ANNOUNCE_SETTLE_MS = 700;

// The one oxygen-exposure warning the form can honestly make, under the whole set of
// cylinders rather than under any one of them. `diveModWarning` carries the reasoning
// for why a multi-cylinder dive gets a claim about the dive and not about a tank.
//
// Unlike `MixtureGasHint` above, this deliberately watches the whole `mixtures`
// array: its answer depends on every cylinder, so there is no narrower subscription
// that would still be correct. It re-renders one `<p>` per keystroke, which is why
// the two are separate components - keeping this subscription out of the per-tank
// hint is what stops that breadth reaching the field cards.
function MixtureSetWarning({
  control,
}: {
  control: Control<MixtureFieldsValues>;
}) {
  const mixtures = useWatch({ control, name: "mixtures" });
  const maxDepth = useWatch({ control, name: "max_depth" });

  const warning = diveModWarning(mixtures ?? [], maxDepth);

  // Announced from a region that is always mounted and `sr-only` when there is
  // nothing to say. A `role="status"` that mounts together with its text is
  // typically not announced at all - screen readers register the region on
  // insertion and read *subsequent* changes - which is the same trap
  // `dive-file-import.tsx` documents.
  //
  // Settled rather than live, which that file did not have to handle: its note is
  // computed once at import, while this sentence quotes the depth and so changes
  // on every keystroke in that box. Bound directly, a polite region would queue an
  // announcement per digit; the timer lets the diver finish typing "45" first.
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const id = setTimeout(
      () => setAnnounced(warning ?? ""),
      ANNOUNCE_SETTLE_MS,
    );
    return () => clearTimeout(id);
  }, [warning]);

  return (
    <>
      {/* `aria-hidden` so the sentence is not also read here, in the copy that
          tracks every keystroke. */}
      {warning && (
        <p
          className="flex items-start gap-1.5 text-xs text-warning"
          aria-hidden
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>{warning}</span>
        </p>
      )}
      <p role="status" className="sr-only">
        {announced}
      </p>
    </>
  );
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

            <FormField
              control={control}
              name={`mixtures.${index}.po2_limit` as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ppO₂ limit (bar)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.4"
                      max="2"
                      // The fallback is named rather than pre-filled, so an empty
                      // box still says what the MOD above it was worked out from.
                      // Seeding 1.4 would make every cylinder claim a limit the
                      // diver never chose - see `DEFAULT_MIXTURE`.
                      placeholder={`${PPO2_WORKING} (default)`}
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
              name={`mixtures.${index}.role` as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  {/* A plain `<select>` rather than the shadcn `Select` used
                      elsewhere on this form, because this one has to express
                      "unset" as a real, selectable option. `Select` has no empty
                      `SelectItem` (Radix reserves `""` for clearing), so the
                      escape hatch would have to be a sentinel value mapped back
                      to `undefined` on both edges - more machinery than a
                      four-option optional field is worth. Most cylinders have no
                      recorded role and that has to stay easy to leave alone. */}
                  <FormControl>
                    <select
                      // `Input`'s own classes rather than a copy of them: this
                      // sits in the same grid row as the ppO₂ box, and the copy
                      // it started as had drifted to a shorter, differently-ringed
                      // control beside it.
                      className={inputClassName}
                      {...field}
                      value={field.value ?? ""}
                      // `""` straight through, not `|| undefined`: react-hook-form
                      // re-displays a field's default whenever its value resolves to
                      // `undefined`, so mapping the "Not recorded" option to it made
                      // choosing that option snap back to the imported role. Same
                      // sentinel and same reason as `po2_limit` above; converted at
                      // the edge by `normalizeMixtures`.
                      onChange={(e) => field.onChange(e.target.value)}
                    >
                      <option value="">Not recorded</option>
                      {GAS_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {GAS_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Narrowing to `MixtureFieldsValues` is sound for the same reason it is in
              `useMixtureFieldArray` above: it is exactly the shape `TFieldValues` is
              constrained to extend. */}
          <MixtureGasHint
            control={control as unknown as Control<MixtureFieldsValues>}
            index={index}
            isOnlyMixture={fields.length === 1}
          />
        </div>
      ))}

      <MixtureSetWarning
        control={control as unknown as Control<MixtureFieldsValues>}
      />
    </div>
  );
}
