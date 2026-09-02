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
} from "@/lib/dive-mixtures";
import { GAS_ROLES, TANK_USAGE } from "@/lib/api/dives";
import { VolumeCombobox } from "@/components/dives/volume-combobox";
import { UnitNumberInput } from "@/components/unit-number-input";
import { EntryUnitToggle } from "@/components/entry-unit-toggle";
import { useEntryUnits } from "@/hooks/useEntryUnits";
import { unitLabel } from "@/lib/units";

export { DEFAULT_MIXTURE };

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
  // The hint's MOD/END/EAD are *depths*, so they follow the depth entry units
  // rather than the account's: a diver typing depths in feet must not be warned
  // about a MOD in metres mid-entry. Everything outside this form still renders
  // in account units.
  const units = useEntryUnits().entryUnits("depth");

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
    // The depths in the hint are converted; `maxDepth` itself is metric form
    // state and stays that way.
    units,
  });
  if (parts.length === 0) return null;

  return <p className="text-xs text-muted-foreground">{parts.join(" · ")}</p>;
}

// The ppO₂ ceilings a cylinder is actually planned to, offered in place of a free
// number box. The schema's band is 0.4-2.0 - wide because it exists to catch a unit
// error (a Suunto JSON export writes 140000 Pa for 1.4 bar), not because a diver picks
// from all of it - and every value in it that a diver would ever choose is one of
// these seven: 1.4 for a back gas, 1.6 for a deco bottle, and the conservative steps
// below them that a few agencies and most CCR plans use.
//
// Strings rather than numbers, which is the one thing here worth stating: an
// `<option>`'s value is a string either way, and going through `Number` in both
// directions puts float formatting between the stored value and the option that has to
// match it - `String(1.0)` is `"1"`, so a `1.0` option labelled `"1.0"` would never
// match its own value. Written as the tokens they are displayed as, the label, the
// value and the round trip are all the same characters.
//
// **The narrowing is a one-way door, and that is accepted.** `ppO2LimitChoices` below
// keeps an unlisted recorded value selectable, but only while it is still the field's
// value: change an imported 1.45 to 1.4 and there is no way back to it, and nothing
// here can reach the 0.4-0.9 band the API's `ck_dive_mixture_po2_limit_range` allows.
// The floor is 1.0 on purpose rather than by inheritance - below that a figure is a
// CCR *setpoint* rather than a limit a MOD is worked out at, and this field feeds a
// MOD. A diver who genuinely needs a number this list doesn't offer has lost
// something; a diver who fat-fingers 14 into a free text box gets an unreadable 422 on
// save, and there are many more of the second.
const PPO2_LIMIT_OPTIONS = ["1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6"];

// The options to offer for a cylinder currently holding `value`.
//
// Normally just the list above. A limit that came from a file and isn't on it -
// anything in the schema's band is possible on the wire - is inserted in its place,
// because a `<select>` whose value matches no option renders blank while the form goes
// on holding the value: the box would say "not recorded" over a cylinder that records
// 1.45, and the diver's only way to find out would be to save and watch the MOD not
// move.
function ppO2LimitChoices(value: number | "" | undefined): string[] {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return PPO2_LIMIT_OPTIONS;
  }
  if (PPO2_LIMIT_OPTIONS.some((option) => Number(option) === value)) {
    return PPO2_LIMIT_OPTIONS;
  }

  return [...PPO2_LIMIT_OPTIONS, String(value)].sort(
    (first, second) => Number(first) - Number(second),
  );
}

// The usage options as the form spells them, which is not how the dive page does.
// `TANK_USAGE_LABELS` is one word each because there it is a name being quoted back
// inside a sentence that carries the meaning separately; here there is no sentence to
// carry it, and "Parallel" alone does not say what it claims about the dive. The
// parenthetical is the definition the diver is being asked to agree to - the flag
// changes what the API computes, so choosing it by guessing at the word is the one
// outcome worth spending width to prevent.
const TANK_USAGE_OPTION_LABELS: Record<(typeof TANK_USAGE)[number], string> = {
  parallel: "Parallel (sidemount / independent)",
  staged: "Staged (own depth)",
};

// How long the gas warning has to hold still before it is announced. Long enough to
// cover typing a two-digit depth without a pause being mistaken for a finished edit.
const ANNOUNCE_SETTLE_MS = 700;

// The one oxygen-exposure warning the form can honestly make, under the whole set of
// cylinders rather than under any one of them. `diveModWarning` carries the reasoning
// for why a multi-cylinder dive usually gets a claim about the dive and not about a
// tank - and for the one set that doesn't, a parallel pair holding a single gas, where
// the sentence is about that gas because there is only one and it was breathed
// throughout. Both readings arrive here as one string either way.
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
  // A depth again, for the same reason as `MixtureGasHint` above.
  const units = useEntryUnits().entryUnits("depth");

  const warning = diveModWarning(mixtures ?? [], maxDepth, units);

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
  const { entryUnits, toggleEntryUnits } = useEntryUnits();
  const pressureUnits = entryUnits("pressure");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Gas Mixtures</h3>
        {/* One toggle for the section rather than one per box: the two pressure
            fields repeat per tank card, so a four-cylinder dive would carry
            eight identical controls with eight identical accessible names.
            Gated on there being a cylinder, because the create form seeds no
            mixtures and an ungated control would govern no visible field. The
            stored override is untouched by the gate, so it comes back exactly
            as the diver left it with the first "Add Mixture". */}
        {fields.length > 0 && (
          <EntryUnitToggle
            dimension="pressure"
            entryUnits={pressureUnits}
            onToggle={() => toggleEntryUnits("pressure")}
          />
        )}
      </div>

      {fields.map((field, index) => (
        <div key={field.id} className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Tank {index + 1}
            </span>
            {/* On every row, tank 1 included. The gate here was `index > 0`, which
                made "this dive records no gas" unreachable from either dive form -
                a state the API supports outright (`DiveCreate.mixtures` is
                `default_factory=list`) and that `dive-mixtures-card.tsx` already
                describes as "the common case for a dive logged by hand". A
                cylinder the diver cannot take off is one they may never have
                entered. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              // Named per row, because the icon is the whole button and a form can
              // hold several: an unlabelled one reads as "button" to a screen
              // reader, and a constant "Remove tank" would name every row the same.
              aria-label={`Remove tank ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name={`mixtures.${index}.volume` as Path<TFieldValues>}
              render={({ field }) => (
                // Half width, paired with the ppO₂ limit beside it. Volume spent
                // two earlier layouts at `md:col-span-2`, first because the field
                // it used to sit beside (the cylinder's name) was removed and
                // widening it was what kept every remaining pair on a row of its
                // own, then because a full-width combobox was pleasant to type
                // into. Eight boxes divide into four rows either way; what the
                // span cost was the last row, where Usage sat alone.
                //
                // Volume | ppO₂, O₂ | He, start | end, Role | Usage: four full
                // rows, and each pair is two facts about the same thing - what
                // the cylinder holds and what it was planned to, the mix, the
                // gauge readings, what it was for and how it was carried.
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
              name={`mixtures.${index}.po2_limit` as Path<TFieldValues>}
              render={({ field }) => {
                const choices = ppO2LimitChoices(field.value);

                return (
                  <FormItem>
                    <FormLabel>ppO₂ limit (bar)</FormLabel>
                    {/* A plain `<select>` for the same two reasons as `role`
                        below: it needs "unset" as a real selectable option,
                        which Radix reserves `""` for, and `""` has to reach
                        react-hook-form as the live cleared value rather than
                        `undefined`, which it re-displays the default over.

                        A picker rather than the number box this started as
                        because the field has an actual vocabulary. Every value
                        it could usefully hold is one of seven, while the box
                        accepted any two decimals in a 0.4-2.0 band - so the
                        only things free entry bought were typos and a 422 on
                        save. */}
                    <FormControl>
                      <select
                        className={inputClassName}
                        {...field}
                        // From the offered list rather than from the raw value,
                        // so the two can't disagree about formatting: `1.0` on
                        // the form has to find the `"1.0"` option, and
                        // `String(1.0)` is `"1"`.
                        value={
                          choices.find(
                            (option) => Number(option) === field.value,
                          ) ?? ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          field.onChange(raw === "" ? "" : parseFloat(raw));
                        }}
                      >
                        {/* The fallback is named rather than pre-selected, so a
                            cylinder with no recorded limit still says what the
                            MOD beneath it was worked out from. Selecting 1.4
                            here would make it claim a limit the diver never
                            chose - see `DEFAULT_MIXTURE`. */}
                        <option value="">
                          Not recorded ({PPO2_WORKING} default)
                        </option>
                        {choices.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
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
                  <FormLabel>
                    Start pressure ({unitLabel("pressure", pressureUnits)})
                  </FormLabel>
                  <FormControl>
                    {/* `emptyValue=""`, unlike every other number box in the
                        dive form: these two pressures are the fields
                        DECISIONS.md names as spelling cleared that way, and the
                        submit path converts the sentinel at the edge. */}
                    <UnitNumberInput
                      dimension="pressure"
                      units={pressureUnits}
                      step="0.01"
                      min={0}
                      emptyValue=""
                      {...field}
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
              name={`mixtures.${index}.end_pressure` as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    End pressure ({unitLabel("pressure", pressureUnits)})
                  </FormLabel>
                  <FormControl>
                    <UnitNumberInput
                      dimension="pressure"
                      units={pressureUnits}
                      step="0.01"
                      min={0}
                      emptyValue=""
                      {...field}
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
                      // sits in a grid row beside other boxes, and the copy it
                      // started as had drifted to a shorter, differently-ringed
                      // control beside them.
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

            <FormField
              control={control}
              name={`mixtures.${index}.usage` as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Usage</FormLabel>
                  {/* A plain `<select>` for the same reason as Role above, and
                      following it deliberately: the two are the cylinder's
                      answers to "what for" and "how", and a diver setting one
                      is usually about to consider the other. Per row rather
                      than once for the dive, so a mixed set - a parallel pair
                      plus a staged bottle - stays expressible, which is the
                      shape the API refuses by design and can only refuse if
                      the form can say it. */}
                  <FormControl>
                    <select
                      className={inputClassName}
                      {...field}
                      value={field.value ?? ""}
                      // `""` straight through, same sentinel and same
                      // react-hook-form trap as Role above.
                      onChange={(e) => field.onChange(e.target.value)}
                    >
                      <option value="">Not recorded</option>
                      {TANK_USAGE.map((usage) => (
                        <option key={usage} value={usage}>
                          {TANK_USAGE_OPTION_LABELS[usage]}
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

      {/* Not an error, and worded so it doesn't read as one: a dive with no
          cylinders is a complete record, and most hand-logged dives are exactly
          that. The line exists so the card says something rather than showing a
          heading over nothing. */}
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No cylinders recorded for this dive.
        </p>
      )}

      {/* Under the tank cards rather than in the section header, so it sits where
          the next tank will appear: the button and the card it adds are then in
          reading order, and on a multi-cylinder dive the diver is already
          scrolled to it after filling in the last one. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ ...DEFAULT_MIXTURE })}
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Mixture
      </Button>

      <MixtureSetWarning
        control={control as unknown as Control<MixtureFieldsValues>}
      />
    </div>
  );
}
