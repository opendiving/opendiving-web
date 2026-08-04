"use client";

import { Control, useFieldArray } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Plus, Trash2 } from "lucide-react";

const VOLUME_OPTIONS = [
  { value: 11.1, label: "11.1 L" },
  { value: 12, label: "12 L" },
  { value: 22.2, label: "2x11.1 L" },
];

// Default values pre-filled when a new mixture (tank) is added. Start/end
// pressure are deliberately left blank ("") rather than defaulted, since
// they vary per tank/fill and shouldn't be guessed.
export const DEFAULT_MIXTURE = {
  volume: 11.1,
  start_pressure: "" as const,
  end_pressure: "" as const,
  oxygen: 21.0,
  helium: 0,
};

// Default name for a mixture based on its position in the list: the first
// tank is assumed to be the "Back Gas", and every subsequent tank is a
// numbered "Deco Gas".
export function getDefaultMixtureName(index: number): string {
  return index === 0 ? "Back Gas" : `Deco Gas ${index}`;
}

export interface MixtureFieldsProps {
  // Using `any` here since this component is shared between the create and
  // edit dive forms, which have distinct (but structurally compatible) form types.
  control: Control<any, any, any>;
}

export function MixtureFields({ control }: MixtureFieldsProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "mixtures",
  });

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
            {fields.length > 1 && (
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
              name={`mixtures.${index}.name`}
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
              name={`mixtures.${index}.volume`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Volume (L)</FormLabel>
                  <Select
                    value={
                      field.value !== undefined
                        ? String(field.value)
                        : undefined
                    }
                    onValueChange={(value) => field.onChange(parseFloat(value))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select volume" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {VOLUME_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={String(option.value)}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name={`mixtures.${index}.oxygen`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>O₂ (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      {...field}
                      onChange={(e) =>
                        field.onChange(parseFloat(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name={`mixtures.${index}.helium`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>He (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      {...field}
                      onChange={(e) =>
                        field.onChange(parseFloat(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name={`mixtures.${index}.start_pressure`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Pressure (bar)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
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
              name={`mixtures.${index}.end_pressure`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End Pressure (bar)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
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
