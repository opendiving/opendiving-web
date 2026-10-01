"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddRowButton } from "@/components/ui/repeatable-row";
import { IconTooltip } from "@/components/ui/tooltip";
import { OTHER_NAME_MAX } from "@/lib/validations/dive-site";

export interface OtherNamesFieldProps {
  value: string[];
  onChange: (names: string[]) => void;
}

// The names a site also goes by - a local-language name, another spelling, a
// wreck's ship name - one box each, in the diver's order.
//
// A box rather than a chip a diver has to commit with Enter, so a name typed and
// never confirmed is still saved. A blank box is dropped on save, and one that
// repeats the site's name or another is dropped by the API - compared trimmed and
// case-folded, which lowercasing here could only approximate - so neither is
// refused on the form.
export function OtherNamesField({ value, onChange }: OtherNamesFieldProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focusAdded = useRef(false);

  // The box a press of "Add" made, once it exists to take the cursor.
  useEffect(() => {
    if (!focusAdded.current) return;
    focusAdded.current = false;
    inputs.current[value.length - 1]?.focus();
  }, [value.length]);

  const set = (index: number, name: string) =>
    onChange(value.map((current, at) => (at === index ? name : current)));

  return (
    <fieldset>
      <legend className="text-sm font-medium leading-none">Other names</legend>
      <div className="mt-2 space-y-2">
        {value.map((name, index) => {
          const label = `Other name ${index + 1}`;
          return (
            <div key={index} className="flex items-center gap-2">
              <Input
                ref={(element) => {
                  inputs.current[index] = element;
                }}
                aria-label={label}
                placeholder="e.g. Sunabe Seawall"
                maxLength={OTHER_NAME_MAX}
                value={name}
                onChange={(event) => set(index, event.target.value)}
              />
              <IconTooltip label={`Remove ${name.trim() || label}`}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange(value.filter((_, at) => at !== index))
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </IconTooltip>
            </div>
          );
        })}
        <AddRowButton
          onClick={() => {
            focusAdded.current = true;
            onChange([...value, ""]);
          }}
        >
          {value.length > 0 ? "Add another name" : "Add a name"}
        </AddRowButton>
      </div>
    </fieldset>
  );
}
