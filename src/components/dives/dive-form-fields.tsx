"use client";

import { Control } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { MixtureFields } from "@/components/dives/mixture-fields";
import { TripCombobox } from "@/components/dives/trip-combobox";
import { DiveSiteMultiSelect } from "@/components/dives/dive-site-multi-select";

export interface DiveFormFieldsProps {
  // Using `any` here since this component is shared between the create and
  // edit dive forms, which have distinct (but structurally compatible) form types.
  control: Control<any, any, any>;
  // In "create" mode, dive number/start time/duration are required by the
  // schema and marked with a "*" in the UI. In "edit" mode these fields are
  // optional at the schema level (a PATCH only needs to send what changed),
  // so no asterisks are shown and a cleared value resolves to `undefined`
  // rather than falling back to a default.
  mode: "create" | "edit";
  // ID of the currently signed-in user, used to fetch/create trips and
  // dive sites scoped to their account for the trip/dive site comboboxes.
  userId: number;
}

export function DiveFormFields({
  control,
  mode,
  userId,
}: DiveFormFieldsProps) {
  const required = mode === "create";
  const requiredMark = required ? " *" : "";

  return (
    <>
      {/* Basic Information & Trip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={control}
          name="dive_number"
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
          name="trip_id"
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
        name="dive_site_ids"
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={control}
          name="start_time"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Start Time{requiredMark}</FormLabel>
              <FormControl>
                <DateTimePicker value={field.value} onChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="duration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Duration (MM:SS){requiredMark}</FormLabel>
              <FormControl>
                <Input type="text" placeholder="e.g. 45:30" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Depth Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={control}
          name="max_depth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Maximum Depth (m)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 30.52"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    field.onChange(Number.isNaN(val) ? null : val);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="avg_depth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Average Depth (m)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 18.24"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    field.onChange(Number.isNaN(val) ? null : val);
                  }}
                />
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
          name="bottom_temperature"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bottom Temperature (°C)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="-50"
                  max="50"
                  placeholder="e.g. 22.50"
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
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="visibility"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Visibility (m)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="e.g. 15"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    field.onChange(Number.isNaN(val) ? null : val);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Gas Mixtures */}
      <MixtureFields control={control} />

      {/* Notes */}
      <FormField
        control={control}
        name="notes"
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
