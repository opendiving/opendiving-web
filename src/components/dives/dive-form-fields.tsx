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
import { Input, inputClassName } from "@/components/ui/input";
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
import { DiveSiteMultiSelect } from "@/components/dives/dive-site-multi-select";
import { DiveGearField } from "@/components/gear/dive-gear-field";
import { cn } from "@/lib/utils";
import { DiveMixtureInput } from "@/lib/validations/dive";
import {
  DiveSiteSummary,
  WATER_TYPES,
  WATER_TYPE_LABELS,
  type WaterType,
} from "@/lib/api/dives";
import { GearItemSummary } from "@/lib/api/gear";

// The field shape shared by both `DiveCreateInput` and `DiveUpdateInput`
// (see `lib/validations/dive.ts`): the create schema's fields, all optional
// (the update schema optionalizes every field, since a PATCH only needs to
// send what changed). Both concrete form input types are structurally
// assignable to this, so `DiveFormFields`/`MixtureFields` can stay generic
// over `TFieldValues` instead of falling back to `Control<any, any, any>`,
// which erased type safety between the create/update form shapes entirely.
export interface DiveFormValues extends FieldValues {
  dive_number?: number;
  // Offset-aware ISO 8601, e.g. "2021-04-04T10:04:47+02:00" - the dive's own
  // original timezone, not the viewer's browser. Edited via
  // `DiveStartTimeField`, which is the only place that splits/recombines it
  // into the wall-clock + offset pair its two underlying inputs actually
  // edit - see `lib/date-time.ts`.
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
  dive_site_uuids?: string[];
  gear_item_uuids?: string[];
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
  mixtureFieldArray,
  knownDiveSites,
  knownGearItems,
  diveNumberNotice,
}: DiveFormFieldsProps<TFieldValues>) {
  const required = mode === "create";
  const requiredMark = required ? " *" : "";

  return (
    <>
      {/* Basic Information & Trip */}
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
      </div>

      {/* Dive Site(s) */}
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

      <FormField
        control={control}
        name={"duration" as Path<TFieldValues>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Duration (MM:SS){requiredMark}</FormLabel>
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

      {/* Depth Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={control}
          name={"max_depth" as Path<TFieldValues>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Maximum depth (m)</FormLabel>
              <div className="relative">
                <ArrowDownToLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 30.52"
                    className="pl-9"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      field.onChange(Number.isNaN(val) ? null : val);
                    }}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={"avg_depth" as Path<TFieldValues>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Average depth (m)</FormLabel>
              <div className="relative">
                <ChevronsDownUp className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 18.24"
                    className="pl-9"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      field.onChange(Number.isNaN(val) ? null : val);
                    }}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Temperature & Visibility */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={control}
          name={"bottom_temperature" as Path<TFieldValues>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bottom temperature (°C)</FormLabel>
              <div className="relative">
                <Thermometer className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="-50"
                    max="50"
                    placeholder="e.g. 22.50"
                    className="pl-9"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      field.onChange(
                        Number.isNaN(val) ? null : Math.round(val * 100) / 100,
                      );
                    }}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={"visibility" as Path<TFieldValues>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Visibility (m)</FormLabel>
              <div className="relative">
                <Eye className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <FormControl>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="e.g. 15"
                    className="pl-9"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      field.onChange(Number.isNaN(val) ? null : val);
                    }}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Water & Altitude - what the water was and where it was, which the
          computer treats as calibration settings and the log treats as facts
          about the dive. They sit under the readings above rather than with the
          gear because they are observations, not choices carried in. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <select
                    className={cn(inputClassName, "pl-9")}
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
                  </select>
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={"altitude" as Path<TFieldValues>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Altitude (m)</FormLabel>
              <div className="relative">
                <Mountain className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <FormControl>
                  <Input
                    type="number"
                    step="1"
                    // Not Visibility's `min="0"`, which this box otherwise
                    // copies: the Dead Sea is below sea level and admitting it
                    // is the whole reason the API's bound is -450 rather than 0.
                    min="-450"
                    max="6500"
                    placeholder="e.g. 372"
                    className="pl-9"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      field.onChange(Number.isNaN(val) ? null : val);
                    }}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Gas Mixtures */}
      <MixtureFields<TFieldValues>
        control={control}
        fieldArray={mixtureFieldArray}
      />

      {/* Gear & weight - grouped as "how the diver was configured for this
          dive", as opposed to the environment readings above. Weight is a plain
          per-dive number rather than one of the gear items (see DECISIONS.md),
          but it belongs next to them here.

          The two are nested rather than rendered side by side because loading a
          gear set fills in *both*: `DiveGearField` needs the weight field's
          value and setter, and nesting is what puts them in scope without
          registering `weight` twice. */}
      <FormField
        control={control}
        name={"weight" as Path<TFieldValues>}
        render={({ field: weightField }) => (
          <div className="space-y-6">
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
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormItem>
                <FormLabel>Weight (kg)</FormLabel>
                <div className="relative">
                  <Weight className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                  <FormControl>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      placeholder="e.g. 6"
                      className="pl-9"
                      {...weightField}
                      value={weightField.value ?? ""}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        weightField.onChange(Number.isNaN(val) ? null : val);
                      }}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            </div>
          </div>
        )}
      />

      {/* Notes */}
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
    </>
  );
}
