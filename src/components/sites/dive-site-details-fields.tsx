"use client";

import type { ReactNode } from "react";
import type { Control } from "react-hook-form";
import { ArrowDownToLine, ArrowUpToLine, Mountain, Waves } from "lucide-react";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { UnitNumberInput } from "@/components/unit-number-input";
import { EntryUnitLabelRow } from "@/components/entry-unit-toggle";
import { DiveVocabularyField } from "@/components/dives/dive-vocabulary-field";
import { TagsMultiSelect } from "@/components/dives/tags-multi-select";
import { useEntryUnits } from "@/hooks/useEntryUnits";
import {
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  WATER_TYPE_LABELS,
  WATER_TYPES,
} from "@/lib/api/dives";
import { unitLabel, type EntryDimension } from "@/lib/units";
import type { DiveSiteFormInput } from "@/lib/validations/dive-site";

export interface DiveSiteDetailsFieldsProps {
  control: Control<DiveSiteFormInput>;
}

// The place's own facts - the depths dived there, its water, its altitude, how
// divers get in - which a new dive at the site starts from, and the diver's tags
// for it. Every field is shown - the dive form's hide-and-show is the dive
// form's, and a diver opens this one once per site.
//
// Depths and the altitude are typed in the diver's units and held in metres, as
// the dive form's are, with the same per-dimension toggle - so feet typed here
// read back as feet on the dive form.
export function DiveSiteDetailsFields({ control }: DiveSiteDetailsFieldsProps) {
  const { entryUnits, toggleEntryUnits } = useEntryUnits();

  // `EntryUnitLabelRow` keeps the toggle out of flow, so a label with one shares
  // its line box with a label without - Water type beside Altitude.
  const unitLabelRow = (
    dimension: EntryDimension,
    label: string,
  ): ReactNode => (
    <EntryUnitLabelRow
      dimension={dimension}
      entryUnits={entryUnits(dimension)}
      onToggle={() => toggleEntryUnits(dimension)}
    >
      <FormLabel>
        {label} ({unitLabel(dimension, entryUnits(dimension))})
      </FormLabel>
    </EntryUnitLabelRow>
  );

  const depthField = (
    name: "depth_from" | "depth_to",
    label: string,
    icon: ReactNode,
    placeholderValue: number,
  ) => (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {unitLabelRow("depth", label)}
          <div className="relative">
            {icon}
            <FormControl>
              <UnitNumberInput
                dimension="depth"
                units={entryUnits("depth")}
                min={0}
                placeholderValue={placeholderValue}
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
  );

  return (
    <>
      {/* The range divers dive it at, shallow end first. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {depthField(
          "depth_from",
          "Depth from",
          <ArrowUpToLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />,
          5,
        )}
        {depthField(
          "depth_to",
          "Depth to",
          <ArrowDownToLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />,
          30,
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DiveVocabularyField
          control={control}
          name="water_type"
          label="Water type"
          icon={Waves}
          values={WATER_TYPES}
          labels={WATER_TYPE_LABELS}
        />
        <FormField
          control={control}
          name="altitude"
          render={({ field }) => (
            <FormItem>
              {unitLabelRow("altitude", "Altitude")}
              <div className="relative">
                <Mountain className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <FormControl>
                  {/* The dive's band, which the API's `CHECK` on a site
                      repeats: the Dead Sea is below sea level. */}
                  <UnitNumberInput
                    dimension="altitude"
                    units={entryUnits("altitude")}
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
      </div>

      <FormField
        control={control}
        name="entry_types"
        render={({ field }) => {
          const value = field.value ?? [];
          return (
            <FormItem>
              {/* A set rather than one value: a site dived from the beach and
                  from a boat is both, and a new dive takes the site's entry only
                  where the set names exactly one. Each row is the label, so the
                  whole line is the target rather than the box. */}
              <fieldset>
                <legend className="text-sm font-medium leading-none">
                  Entry types
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-x-4 sm:grid-cols-4">
                  {ENTRY_TYPES.map((entry) => (
                    <label
                      key={entry}
                      className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={value.includes(entry)}
                        onChange={(event) =>
                          field.onChange(
                            event.target.checked
                              ? [...value, entry]
                              : value.filter((other) => other !== entry),
                          )
                        }
                      />
                      {ENTRY_TYPE_LABELS[entry]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </FormItem>
          );
        }}
      />

      <FormField
        control={control}
        name="tags"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Tags</FormLabel>
            <FormControl>
              <TagsMultiSelect
                value={field.value ?? []}
                onChange={field.onChange}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
