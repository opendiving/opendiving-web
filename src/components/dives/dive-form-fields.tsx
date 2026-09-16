"use client";

import { Control, FieldValues, Path } from "react-hook-form";
import {
  ArrowDownToLine,
  ChevronsDownUp,
  Clock,
  Eye,
  Mountain,
  Thermometer,
  Waves,
  Weight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { UnitNumberInput } from "@/components/unit-number-input";
import { Textarea } from "@/components/ui/textarea";
import { DiveStartTimeField } from "@/components/dives/dive-start-time-field";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  MixtureFieldArray,
  MixtureFields,
} from "@/components/dives/mixture-fields";
import { TripCombobox } from "@/components/dives/trip-combobox";
import { CourseCombobox } from "@/components/courses/course-combobox";
import { DiveSiteMultiSelect } from "@/components/dives/dive-site-multi-select";
import { DiveGearField } from "@/components/gear/dive-gear-field";
import { SpeciesMultiSelect } from "@/components/dives/species-multi-select";
import { DiveMixtureInput } from "@/lib/validations/dive";
import {
  DiveSiteSummary,
  WATER_TYPES,
  WATER_TYPE_LABELS,
  type WaterType,
} from "@/lib/api/dives";
import { GearItemSummary } from "@/lib/api/gear";
import { SpeciesSummary } from "@/lib/api/species";
import { useEntryUnits } from "@/hooks/useEntryUnits";
import { EntryUnitLabelRow } from "@/components/entry-unit-toggle";
import { unitLabel } from "@/lib/units";
import type { DiveFormFieldKey } from "@/lib/dive-form-fields";
import type { DiveFormVisibility } from "@/hooks/useDiveFormVisibility";

// The field shape shared by both `DiveCreateInput` and `DiveUpdateInput`
// (see `lib/validations/dive.ts`): the create schema's fields, all optional
// (the update schema optionalizes every field, since a PATCH only needs to
// send what changed). Both concrete form input types are structurally
// assignable to this, so `DiveFormFields`/`MixtureFields` can stay generic
// over `TFieldValues` instead of falling back to `Control<any, any, any>`,
// which erased type safety between the create/update form shapes entirely.
export interface DiveFormValues extends FieldValues {
  dive_number?: number;
  // ISO 8601, e.g. "2021-04-04T10:04:47+02:00" - the dive's own original
  // timezone, not the viewer's browser, and on an imported dive possibly no
  // timezone at all ("2026-04-17T11:49:23"). Edited via `DiveStartTimeField`,
  // which is the only place that splits/recombines it into the wall-clock +
  // offset pair its two underlying inputs actually edit - see
  // `lib/date-time.ts`.
  start_time?: string;
  duration?: string;
  max_depth?: number | null;
  avg_depth?: number | null;
  bottom_temperature?: number | null;
  visibility?: number | null;
  // `""` is the "Not recorded" option, and the live cleared state - never
  // `undefined`, which react-hook-form re-displays the field's default for.
  // `null` is what the submit path converts it to; both are in the union
  // because `diveToFormValues` seeds one and `buildDiveUpdate` reads the other.
  water_type?: WaterType | "" | null;
  altitude?: number | null;
  weight?: number | null;
  // `null` means "no trip", and is distinct from `undefined` ("field not
  // touched") on the edit form - see `DiveUpdate.trip_uuid`.
  trip_uuid?: string | null;
  // Same three states, same reason, for the training course this dive was on.
  course_uuid?: string | null;
  dive_site_uuids?: string[];
  gear_item_uuids?: string[];
  species_uuids?: string[];
  notes?: string;
  mixtures?: DiveMixtureInput[];
}

export interface DiveFormFieldsProps<TFieldValues extends DiveFormValues> {
  control: Control<TFieldValues>;
  // In "create" mode, dive number/start time/duration are required by the
  // schema and marked with a "*" in the UI. In "edit" mode these fields are
  // optional at the schema level (a PATCH only needs to send what changed),
  // so no asterisks are shown and a cleared value resolves to `undefined`
  // rather than falling back to a default.
  mode: "create" | "edit";
  // UUID of the currently signed-in user, used to fetch/create trips and
  // dive sites scoped to their account for the trip/dive site comboboxes.
  userId: string;
  // Which of the optional fields this form renders at all. A hidden field's
  // `FormField` is not rendered, so its input is out of the DOM, the tab order and
  // the accessibility tree - and its *value* is untouched by that, which is
  // react-hook-form's `shouldUnregister: false` default doing the work.
  visibility: DiveFormVisibility;
  // Created once by the page (alongside `form`/`control`) and also passed to
  // `DiveFileImport` - see `MixtureFieldArray`'s own doc comment for why this
  // can't just be created internally by `MixtureFields`.
  mixtureFieldArray: MixtureFieldArray;
  // The dive's existing sites, when editing. The site picker no longer loads
  // the user's whole catalogue, so it can't look a selected uuid's name up
  // locally - passing the ones already on the record saves it a request each.
  knownDiveSites?: DiveSiteSummary[];
  // Same idea for gear: `Dive.gear_items` already carries what a picked row
  // renders, so the picker needn't fetch each item back by uuid.
  knownGearItems?: GearItemSummary[];
  // And for species: `Dive.species` carries the names the picker's rows need,
  // so an edit form starts out labelled without a lookup per row.
  knownSpecies?: SpeciesSummary[];
  // Raised by the species picker while a pick is still being resolved into a
  // catalog row - see `SpeciesMultiSelect.onPendingChange`. Owned by
  // `DiveFormCard`, which is where the submit button that must wait for it is.
  onSpeciesPendingChange?: (isPending: boolean) => void;
  // A note shown under the dive number, but only while the field still holds
  // `forValue`. Carried as a value rather than a ready-made string so the
  // "still showing it?" check can happen inside the field's own render, where
  // the current value is already reactive - the alternative, a `form.watch` in
  // the page, opts that whole component out of compiler memoization.
  //
  // Currently only the create form sets it, to say the suggested number is
  // already in use (see `useSuggestedDiveNumber`). A note rather than a
  // validation error on purpose: duplicates are a normal state while
  // back-filling a log, reconciled later with Renumber, so this must not block
  // a save.
  diveNumberNotice?: { forValue: number; message: string } | null;
}

export function DiveFormFields<TFieldValues extends DiveFormValues>({
  control,
  mode,
  userId,
  visibility,
  mixtureFieldArray,
  knownDiveSites,
  knownGearItems,
  knownSpecies,
  onSpeciesPendingChange,
  diveNumberNotice,
}: DiveFormFieldsProps<TFieldValues>) {
  const required = mode === "create";
  const requiredMark = required ? " *" : "";
  // Read once here and handed to the labels and the number boxes below, per
  // dimension: the account preference unless the diver has flipped that dimension
  // with the toggle in its label row. Form state itself stays metric whatever
  // this says - see `UnitNumberInput`.
  const { entryUnits, toggleEntryUnits } = useEntryUnits();
  const isVisible = visibility.isVisible;

  // Depth's one toggle follows the first *visible* depth field, so hiding Maximum
  // depth moves it onto Average depth rather than stranding the dimension without a
  // control. With both hidden the form has no depth control at all and the gas
  // hints render in the effective unit, labelled as they already are.
  const depthToggleField: DiveFormFieldKey | null = isVisible("max_depth")
    ? "max_depth"
    : isVisible("avg_depth")
      ? "avg_depth"
      : null;
  const depthLabelRow = (
    key: DiveFormFieldKey,
    label: React.ReactNode,
  ): React.ReactNode =>
    depthToggleField === key ? (
      <EntryUnitLabelRow
        dimension="depth"
        entryUnits={entryUnits("depth")}
        onToggle={() => toggleEntryUnits("depth")}
      >
        {label}
      </EntryUnitLabelRow>
    ) : (
      label
    );

  return (
    <>
      {/* Trip & Course, a pair in a two-column grid so each keeps the same column
          width, gap and label rhythm as every other row in this form.

          Guarded, and that guard is load-bearing now that Dive number has moved
          out from under it: with both of these hidden the grid would render empty
          and leave the form's `space-y-6` gap between the card's top and the dive
          site, which reads as a field that failed to load.

          With exactly one of them visible the survivor spans both columns rather
          than sitting half-width beside a hole - `FormField` renders `FormItem`
          as this grid's direct child, so `:only-child` is the remaining field.
          The `md:` prefix is required: below it the grid is one column wide and a
          `col-span-2` would invent a second. The readings grid below solves the
          same problem by packing instead; this row cannot, having only the two
          fields, and a full-width combobox reads well directly above the
          full-width dive site picker. */}
      {(isVisible("trip_uuid") || isVisible("course_uuid")) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:[&>:only-child]:col-span-2">
          {isVisible("trip_uuid") && (
            <FormField
              control={control}
              name={"trip_uuid" as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trip</FormLabel>
                  <FormControl>
                    <TripCombobox
                      userId={userId}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {isVisible("course_uuid") && (
            <FormField
              control={control}
              name={"course_uuid" as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course</FormLabel>
                  <FormControl>
                    <CourseCombobox
                      userId={userId}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      )}

      {/* Dive Site(s) */}
      {isVisible("dive_site_uuids") && (
        <FormField
          control={control}
          name={"dive_site_uuids" as Path<TFieldValues>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dive site(s)</FormLabel>
              <FormControl>
                <DiveSiteMultiSelect
                  userId={userId}
                  value={field.value ?? []}
                  knownSites={knownDiveSites}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Date and Time */}
      <FormField
        control={control}
        name={"start_time" as Path<TFieldValues>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Start time{requiredMark}</FormLabel>
            <FormControl>
              <DiveStartTimeField
                value={field.value}
                onChange={field.onChange}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Dive number & Duration. Paired because both are always rendered -
          neither is in the Fields dialog - so this row is the one pair no
          visibility choice can break, and neither field has to sit half-width
          beside a hole. Dive number was alone in a grid of its own until then,
          for the column width: full width would make the form's one
          always-present field its widest, and a number box is the last thing
          that should be. The pair keeps that width without the empty column.

          Unequal heights are expected here: `diveNumberNotice` adds a line
          under the number when the suggestion is already taken, and Duration
          has nothing to match it with. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={control}
          name={"dive_number" as Path<TFieldValues>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dive number{requiredMark}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => {
                    // `parseInt(...) || 1` looked equivalent and wasn't: `||`
                    // treats an emptied box (NaN) and a typed 0 alike, so
                    // clearing the field instantly rewrote it to 1. That write
                    // also marked the field dirty, and `useSuggestedDiveNumber`
                    // reads `isDirty` as its permanent "the diver chose a
                    // number" latch - so one accidental clear stopped the
                    // number following the date for the rest of the form's
                    // life, including after a file import changed the date.
                    // An emptied box must stay empty and let the schema speak.
                    const parsed = parseInt(e.target.value, 10);
                    field.onChange(Number.isNaN(parsed) ? undefined : parsed);
                  }}
                />
              </FormControl>
              {diveNumberNotice && field.value === diveNumberNotice.forValue ? (
                <FormDescription>{diveNumberNotice.message}</FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={"duration" as Path<TFieldValues>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Duration{requiredMark}</FormLabel>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <FormControl>
                  <Input
                    type="text"
                    placeholder="e.g. 45 or 67:30"
                    className="pl-9"
                    {...field}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* The readings: depth, then the environment the Fields dialog groups
          under that name. One grid rather than three fixed pairs, because every
          one of these six hides on its own. Paired up, hiding half of a pair
          left the other half in its column with an empty one beside it, which
          reads as a field that failed to load; a single grid lets auto-flow
          pack whatever survives from the left, so a hidden field costs a slot
          and not a hole. With all six visible the rows hold what they always
          held - depth, temperature and visibility, water and altitude - and
          sit where they always sat, which is what the row gap below is for.

          An odd number visible leaves one field half-width on the last row.
          That is accepted and deliberately not spanned: a ragged bottom edge
          reads as the end of a list, a gap in the middle reads as breakage.

          `gap-y-6` rather than `gap-4`'s 1rem, because these rows used to be
          three separate children of the form's `space-y-6` and the 1.5rem
          between them was the form's own rhythm, not a pair's. Merging them
          into one grid would otherwise tighten the whole card by 8px a row
          while every other block boundary stayed where it was. The column gap
          is still 1rem, so a visible row is pixel-identical to the one it
          replaces. On a phone the six stack at 1.5rem where the old pairs
          stacked at 1rem inside themselves - one grid has one row gap, and
          after this merge there are no pairs left for the tighter one to mean
          anything about. */}
      {(isVisible("max_depth") ||
        isVisible("avg_depth") ||
        isVisible("bottom_temperature") ||
        isVisible("visibility") ||
        isVisible("water_type") ||
        isVisible("altitude")) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
          {isVisible("max_depth") && (
            <FormField
              control={control}
              name={"max_depth" as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  {/* Depth's one toggle, and whether it sits here is a question about
                  what is on screen: `avg_depth` below carries it instead when this
                  field is hidden, so the dimension never loses its control while a
                  field it governs is still being typed into. Never both at once - a
                  second control would be a duplicate accessible name over the same
                  dimension. */}
                  {depthLabelRow(
                    "max_depth",
                    <FormLabel>
                      Maximum depth ({unitLabel("depth", entryUnits("depth"))})
                    </FormLabel>,
                  )}
                  <div className="relative">
                    <ArrowDownToLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <FormControl>
                      <UnitNumberInput
                        dimension="depth"
                        units={entryUnits("depth")}
                        min={0}
                        placeholderValue={30.52}
                        className="pl-9"
                        {...field}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {isVisible("avg_depth") && (
            <FormField
              control={control}
              name={"avg_depth" as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  {depthLabelRow(
                    "avg_depth",
                    <FormLabel>
                      Average depth ({unitLabel("depth", entryUnits("depth"))})
                    </FormLabel>,
                  )}
                  <div className="relative">
                    <ChevronsDownUp className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <FormControl>
                      <UnitNumberInput
                        dimension="depth"
                        units={entryUnits("depth")}
                        min={0}
                        placeholderValue={18.24}
                        className="pl-9"
                        {...field}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {isVisible("bottom_temperature") && (
            <FormField
              control={control}
              name={"bottom_temperature" as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <EntryUnitLabelRow
                    dimension="temperature"
                    entryUnits={entryUnits("temperature")}
                    onToggle={() => toggleEntryUnits("temperature")}
                  >
                    <FormLabel>
                      Bottom temperature (
                      {unitLabel("temperature", entryUnits("temperature"))})
                    </FormLabel>
                  </EntryUnitLabelRow>
                  <div className="relative">
                    <Thermometer className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <FormControl>
                      {/* The 2-decimal entry rounding this field has always done is
                      now the component's, and every float sibling above and
                      below gets it too. */}
                      <UnitNumberInput
                        dimension="temperature"
                        units={entryUnits("temperature")}
                        min={-50}
                        max={50}
                        placeholderValue={22.5}
                        className="pl-9"
                        {...field}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {isVisible("visibility") && (
            <FormField
              control={control}
              name={"visibility" as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <EntryUnitLabelRow
                    dimension="visibility"
                    entryUnits={entryUnits("visibility")}
                    onToggle={() => toggleEntryUnits("visibility")}
                  >
                    <FormLabel>
                      Visibility (
                      {unitLabel("visibility", entryUnits("visibility"))})
                    </FormLabel>
                  </EntryUnitLabelRow>
                  <div className="relative">
                    <Eye className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <FormControl>
                      {/* An `Integer` column, so feet commit whole metres: 50 ft is
                      stored as 15 m and reads back as 49 ft. Accepted - see
                      DECISIONS.md - because visibility is an estimate and
                      whole-metre resolution is finer than anyone judges it to. */}
                      <UnitNumberInput
                        dimension="visibility"
                        units={entryUnits("visibility")}
                        min={0}
                        placeholderValue={15}
                        className="pl-9"
                        {...field}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {/* Water and altitude - what the water was and where it was, which the
          computer treats as calibration settings and the log treats as facts
          about the dive. Last in the grid rather than with the gear because
          they are observations, not choices carried in. */}
          {isVisible("water_type") && (
            <FormField
              control={control}
              name={"water_type" as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Water type</FormLabel>
                  {/* A plain `<select>` rather than the shadcn `Select` used
                  elsewhere, for the same reason as the cylinder Role picker in
                  `mixture-fields.tsx`: this one needs "unset" as a real,
                  selectable option, and Radix reserves `""` for clearing. */}
                  <div className="relative">
                    <Waves className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <FormControl>
                      <NativeSelect
                        className="pl-9"
                        {...field}
                        value={field.value ?? ""}
                        // `""` straight through, not `|| undefined`: react-hook-form
                        // re-displays a field's default whenever its value resolves
                        // to `undefined`, so mapping "Not recorded" to it would snap
                        // an imported water type back the moment it was cleared. The
                        // submit paths convert the sentinel away.
                        onChange={(e) => field.onChange(e.target.value)}
                      >
                        <option value="">Not recorded</option>
                        {WATER_TYPES.map((waterType) => (
                          <option key={waterType} value={waterType}>
                            {WATER_TYPE_LABELS[waterType]}
                          </option>
                        ))}
                      </NativeSelect>
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {isVisible("altitude") && (
            <FormField
              control={control}
              name={"altitude" as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <EntryUnitLabelRow
                    dimension="altitude"
                    entryUnits={entryUnits("altitude")}
                    onToggle={() => toggleEntryUnits("altitude")}
                  >
                    <FormLabel>
                      Altitude ({unitLabel("altitude", entryUnits("altitude"))})
                    </FormLabel>
                  </EntryUnitLabelRow>
                  <div className="relative">
                    <Mountain className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <FormControl>
                      {/* Bounds declared in metres, which is what the Zod schema and
                      the DB `CHECK` behind it are written in; the component
                      converts them inward for the spinner, so what the arrows
                      offer is always something the schema will accept. */}
                      <UnitNumberInput
                        dimension="altitude"
                        units={entryUnits("altitude")}
                        // Not Visibility's `min={0}`, which this box otherwise
                        // copies: the Dead Sea is below sea level and admitting it
                        // is the whole reason the API's bound is -450 rather than 0.
                        min={-450}
                        max={6500}
                        placeholderValue={372}
                        className="pl-9"
                        {...field}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      )}

      {/* Gas Mixtures. Hidden, the whole section goes - the heading, the pressure
          toggle, every tank card, "Add Mixture" and the empty-state line - while the
          cylinders themselves stay in form state and are submitted, exactly as a
          hidden scalar is. */}
      {isVisible("mixtures") && (
        <MixtureFields<TFieldValues>
          control={control}
          fieldArray={mixtureFieldArray}
          isVisible={isVisible}
        />
      )}

      {/* Gear & weight - grouped as "how the diver was configured for this
          dive", as opposed to the environment readings above. Weight is a plain
          per-dive number rather than one of the gear items (see DECISIONS.md),
          but it belongs next to them here.

          The two are nested rather than rendered side by side because loading a
          gear set fills in *both*: `DiveGearField` needs the weight field's
          value and setter, and nesting is what puts them in scope without
          registering `weight` twice.

          They still hide independently, and the nesting is what makes that cheap:
          the outer `FormField` is a render prop rather than an input, so each half
          is gated on its own key inside it and `weight` is registered exactly once
          however many of the two are on screen. The pair is skipped altogether when
          neither is - `weight`'s value survives that, which is
          `shouldUnregister: false`. */}
      {(isVisible("gear_item_uuids") || isVisible("weight")) && (
        <FormField
          control={control}
          name={"weight" as Path<TFieldValues>}
          render={({ field: weightField }) => (
            <div className="space-y-6">
              {isVisible("gear_item_uuids") && (
                <FormField
                  control={control}
                  name={"gear_item_uuids" as Path<TFieldValues>}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gear</FormLabel>
                      <FormControl>
                        <DiveGearField
                          userId={userId}
                          value={field.value ?? []}
                          knownItems={knownGearItems}
                          onChange={field.onChange}
                          weight={weightField.value ?? null}
                          onWeightChange={weightField.onChange}
                          // The third of the four moments a value arrives from outside
                          // the diver's typing: a set that carries a weight fills the
                          // box, so the box has to be on screen to be seen and changed.
                          onSetApplied={(set) => {
                            const revealed: DiveFormFieldKey[] = [];
                            if (set.gear_items.length > 0) {
                              revealed.push("gear_item_uuids");
                            }
                            if (set.weight != null) revealed.push("weight");
                            visibility.reveal(revealed);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isVisible("weight") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormItem>
                    {/* Weight is the one dimension with a second toggle elsewhere:
                    the gear-set dialog opens from inside this form and enters a
                    weight of its own. Both read the same store, so the two never
                    disagree, and Radix's modal `aria-hidden` keeps only one of
                    them exposed at a time. */}
                    <EntryUnitLabelRow
                      dimension="weight"
                      entryUnits={entryUnits("weight")}
                      onToggle={() => toggleEntryUnits("weight")}
                    >
                      <FormLabel>
                        Weight ({unitLabel("weight", entryUnits("weight"))})
                      </FormLabel>
                    </EntryUnitLabelRow>
                    <div className="relative">
                      <Weight className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                      <FormControl>
                        <UnitNumberInput
                          dimension="weight"
                          units={entryUnits("weight")}
                          min={0}
                          placeholderValue={6}
                          className="pl-9"
                          {...weightField}
                          value={weightField.value}
                          onChange={weightField.onChange}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                </div>
              )}
            </div>
          )}
        />
      )}

      {/* Species spotted - after the kit and before the notes, which is where
          the dive page's own card sits: what was seen is an observation about
          the dive, and the notes underneath are where anything this picker
          can't name ends up. */}
      {isVisible("species_uuids") && (
        <FormField
          control={control}
          name={"species_uuids" as Path<TFieldValues>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Species spotted</FormLabel>
              <FormControl>
                <SpeciesMultiSelect
                  value={field.value ?? []}
                  knownSpecies={knownSpecies}
                  onChange={field.onChange}
                  onPendingChange={onSpeciesPendingChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Notes */}
      {isVisible("notes") && (
        <FormField
          control={control}
          name={"notes" as Path<TFieldValues>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Enter any additional notes about your dive..."
                  className="min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </>
  );
}
