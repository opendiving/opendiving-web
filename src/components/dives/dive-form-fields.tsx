"use client";

import { Control, FieldValues, Path } from "react-hook-form";
import { Clock, Gauge, Thermometer, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DiveStartTimeField } from "@/components/dives/dive-start-time-field";
import {
  FormControl,
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
import { DiveMixtureInput } from "@/lib/validations/dive";

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
  trip_uuid?: string;
  dive_site_uuids?: string[];
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
}

export function DiveFormFields<TFieldValues extends DiveFormValues>({
  control,
  mode,
  userId,
  mixtureFieldArray,
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
              <FormLabel>Dive Number{requiredMark}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  {...field}
                  onChange={(e) =>
                    field.onChange(
                      parseInt(e.target.value) || (required ? 1 : undefined),
                    )
                  }
                />
              </FormControl>
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
            <FormLabel>Dive Site(s)</FormLabel>
            <FormControl>
              <DiveSiteMultiSelect
                userId={userId}
                value={field.value ?? []}
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
            <FormLabel>Start Time{requiredMark}</FormLabel>
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
            <FormControl>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  type="text"
                  placeholder="e.g. 45 or 67:30"
                  className="pl-9"
                  {...field}
                />
              </div>
            </FormControl>
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
              <FormLabel>Maximum Depth (m)</FormLabel>
              <FormControl>
                <div className="relative">
                  <Gauge className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
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
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={"avg_depth" as Path<TFieldValues>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Average Depth (m)</FormLabel>
              <FormControl>
                <div className="relative">
                  <Gauge className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
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
                </div>
              </FormControl>
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
              <FormLabel>Bottom Temperature (°C)</FormLabel>
              <FormControl>
                <div className="relative">
                  <Thermometer className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
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
                </div>
              </FormControl>
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
              <FormControl>
                <div className="relative">
                  <Eye className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
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
                </div>
              </FormControl>
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
