"use client";

import { Control, FieldValues, Path } from "react-hook-form";
import type { LucideIcon } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export interface DiveVocabularyFieldProps<
  TFieldValues extends FieldValues,
  TValue extends string,
> {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  label: string;
  icon: LucideIcon;
  /**
   * What the picker offers, in order: the API's vocabulary or part of it. A stored
   * value outside it is still offered while the field holds it, so a save never
   * drops it unasked.
   */
  values: readonly TValue[];
  labels: Record<TValue, string>;
}

// One of the dive's closed vocabularies - the water, the dive type, the
// conditions, the entry - as a select with "Not recorded" first.
//
// A plain `<select>` rather than the shadcn `Select` used elsewhere, for the same
// reason as the cylinder Role picker in `mixture-fields.tsx`: "unset" has to be a
// real, selectable option, and Radix reserves `""` for clearing. The three states
// behind it are DECISIONS.md's "A dive-level select carries the same three
// states".
export function DiveVocabularyField<
  TFieldValues extends FieldValues,
  TValue extends string,
>({
  control,
  name,
  label,
  icon: Icon,
  values,
  labels,
}: DiveVocabularyFieldProps<TFieldValues, TValue>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <div className="relative">
            <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <FormControl>
              <NativeSelect
                className="pl-9"
                {...field}
                value={field.value ?? ""}
                // `""` straight through, not `|| undefined`: react-hook-form
                // re-displays a field's default whenever its value resolves to
                // `undefined`, so mapping "Not recorded" to it would snap the
                // dive's stored value back the moment it was cleared. The submit
                // paths convert the sentinel away.
                onChange={(e) => field.onChange(e.target.value)}
              >
                <option value="">Not recorded</option>
                {(values.includes(field.value) || !(field.value in labels)
                  ? values
                  : [...values, field.value as TValue]
                ).map((value) => (
                  <option key={value} value={value}>
                    {labels[value]}
                  </option>
                ))}
              </NativeSelect>
            </FormControl>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
