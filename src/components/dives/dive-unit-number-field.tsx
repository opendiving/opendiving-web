"use client";

import {
  Control,
  ControllerRenderProps,
  FieldValues,
  Path,
} from "react-hook-form";
import type { LucideIcon } from "lucide-react";
import { EntryUnitLabelRow } from "@/components/entry-unit-toggle";
import { UnitNumberInput } from "@/components/unit-number-input";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useEntryUnits } from "@/hooks/useEntryUnits";
import { unitLabel, type EntryDimension } from "@/lib/units";

interface UnitNumberItemProps {
  /** The label without its unit, which follows the dimension's entry units. */
  label: string;
  dimension: EntryDimension;
  /** Inside the box, on its left. Absent on a tank's pressures, which carry none. */
  icon?: LucideIcon;
  min?: number;
  max?: number;
  placeholderValue?: number;
  emptyValue?: null | "";
}

export interface DiveUnitNumberFieldProps<
  TFieldValues extends FieldValues,
> extends UnitNumberItemProps {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
}

// One of the dive form's measured numbers: a label carrying its unit and the toggle
// that flips it, the box, and the field's message. Every box of one dimension shares
// the toggle's setting - flipping Maximum depth flips Average depth too - since all
// of them read the one setting `useEntryUnits` keeps per dimension.
export function DiveUnitNumberField<TFieldValues extends FieldValues>({
  control,
  name,
  ...item
}: DiveUnitNumberFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => <DiveUnitNumberItem field={field} {...item} />}
    />
  );
}

/** The field's body, for a host that already holds the `FormField` - see the weight. */
export function DiveUnitNumberItem<TFieldValues extends FieldValues>({
  field,
  label,
  dimension,
  icon: Icon,
  ...input
}: UnitNumberItemProps & {
  field: ControllerRenderProps<TFieldValues, Path<TFieldValues>>;
}) {
  const { entryUnits, toggleEntryUnits } = useEntryUnits();
  const units = entryUnits(dimension);
  const box = (
    <FormControl>
      <UnitNumberInput
        dimension={dimension}
        units={units}
        className={Icon && "pl-9"}
        {...input}
        {...field}
      />
    </FormControl>
  );

  return (
    <FormItem>
      <EntryUnitLabelRow
        dimension={dimension}
        entryUnits={units}
        onToggle={() => toggleEntryUnits(dimension)}
      >
        <FormLabel>
          {label} ({unitLabel(dimension, units)})
        </FormLabel>
      </EntryUnitLabelRow>
      {Icon ? (
        <div className="relative">
          <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          {box}
        </div>
      ) : (
        box
      )}
      <FormMessage />
    </FormItem>
  );
}
