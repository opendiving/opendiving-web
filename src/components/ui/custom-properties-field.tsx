"use client";

import { useId } from "react";
import {
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
  type FieldError,
} from "react-hook-form";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconTooltip } from "@/components/ui/tooltip";
import { AddRowButton } from "@/components/ui/repeatable-row";
import {
  CUSTOM_PROPERTIES_MAX,
  CUSTOM_PROPERTY_KEY_MAX,
  CUSTOM_PROPERTY_VALUE_MAX,
  type CustomProperty,
} from "@/lib/custom-properties";

// The slice of a form this field reads and writes; every record form names it
// `custom_properties`, so the field needs no name of its own.
interface WithCustomProperties {
  custom_properties: CustomProperty[];
}

interface RowErrors {
  key?: FieldError;
  value?: FieldError;
}

/**
 * A record's custom properties in its form: a key and a value per row, in the
 * diver's order, added and removed in place. A row's label names it for a
 * screen reader by its key, or by its place while the key is still empty - see
 * "Row-action names" in DECISIONS.md.
 */
export function CustomPropertiesField() {
  const { control, register } = useFormContext<WithCustomProperties>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "custom_properties",
  });
  const { errors } = useFormState({ control, name: "custom_properties" });
  const rowErrors = (errors.custom_properties ?? []) as (
    RowErrors | undefined
  )[];
  // The list's own refusal - too many rows - which the resolver puts on the
  // array itself, beside the rows' errors.
  const list = errors.custom_properties as
    { root?: FieldError; message?: string } | undefined;
  const listError = list?.root?.message ?? list?.message;
  // Live, so a row's labels follow its key as it is typed.
  const rows = useWatch({ control, name: "custom_properties" });
  const id = useId();

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">
        Custom properties
      </legend>
      <p className="text-sm text-muted-foreground">
        Anything this record has no field for, such as a serial number or a
        booking reference.
      </p>
      {fields.length > 0 && (
        <ul className="space-y-2">
          {fields.map((field, index) => {
            const name = rows?.[index]?.key.trim() || `property ${index + 1}`;
            const keyId = `${id}-${index}-key`;
            const valueId = `${id}-${index}-value`;
            const error = rowErrors[index];
            return (
              <li key={field.id} className="space-y-1">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={keyId} className="sr-only">
                      Key of {name}
                    </Label>
                    <Input
                      id={keyId}
                      placeholder="Key"
                      maxLength={CUSTOM_PROPERTY_KEY_MAX}
                      autoComplete="off"
                      aria-invalid={!!error?.key}
                      {...register(`custom_properties.${index}.key`)}
                    />
                  </div>
                  <div className="min-w-0 flex-[2]">
                    <Label htmlFor={valueId} className="sr-only">
                      Value of {name}
                    </Label>
                    <Input
                      id={valueId}
                      placeholder="Value"
                      maxLength={CUSTOM_PROPERTY_VALUE_MAX}
                      autoComplete="off"
                      aria-invalid={!!error?.value}
                      {...register(`custom_properties.${index}.value`)}
                    />
                  </div>
                  <IconTooltip label={`Remove ${name}`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </IconTooltip>
                </div>
                {(error?.key || error?.value) && (
                  <p className="text-sm text-destructive">
                    {error.key?.message ?? error.value?.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {listError && <p className="text-sm text-destructive">{listError}</p>}
      <AddRowButton
        disabled={fields.length >= CUSTOM_PROPERTIES_MAX}
        onClick={() => append({ key: "", value: "" })}
      >
        Add property
      </AddRowButton>
    </fieldset>
  );
}
