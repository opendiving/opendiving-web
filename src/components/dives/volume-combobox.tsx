"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface VolumeOption {
  value: number;
  label: string;
}

// Common cylinder water capacities (liters). Plain-metric entries are typical
// European steel/aluminum single/twin tanks; imperial-origin entries are
// common US aluminum cylinders, labeled with their familiar cu-ft-based size
// (e.g. "S80") alongside the actual liter water capacity, since that's how
// divers usually refer to them day to day.
export const VOLUME_OPTIONS: VolumeOption[] = [
  { value: 3, label: "3 L" },
  { value: 5, label: "5 L" },
  { value: 7.1, label: "7.1 L (S50)" },
  { value: 9.2, label: "9.2 L (S63)" },
  { value: 10, label: "10 L" },
  { value: 10.2, label: "10.2 L (S72)" },
  { value: 11.1, label: "11.1 L (S80)" },
  { value: 12, label: "12 L" },
  { value: 13.6, label: "13.6 L (S100)" },
  { value: 15, label: "15 L" },
  { value: 18, label: "18 L" },
  { value: 20, label: "20 L" },
  { value: 22.2, label: "22.2 L (2x S80)" },
  { value: 24, label: "24 L (2x12 L)" },
];

export interface VolumeComboboxProps {
  value?: number;
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
}

// A combobox for picking a cylinder volume: click one of the common-size
// presets below (always shown in full, not filtered by what's typed - there
// are few enough that filtering just makes it harder to browse them all), or
// type/commit an arbitrary number (e.g. an odd steel tank, or a value filled
// in from a parsed dive-computer file - see `dive-file-import.tsx`) that
// isn't one of them. The input itself only ever shows the plain number, never
// a preset's label (e.g. "11.1", not "11.1 L (S80)") - the label is just a
// hint shown in the dropdown to help pick the right preset.
//
// Deliberately a plain input + manually-rendered dropdown (mirroring
// `CreatableCombobox`'s approach) rather than a Radix/shadcn `Select`: a
// `Select` needs a `<SelectItem>` already registered for the current value in
// order to display it, which doesn't hold for arbitrary/parsed values (see
// DECISIONS.md's "NaN L" gotcha) - a plain controlled input always displays
// exactly what `value` holds, with no item-registration indirection to go wrong.
export function VolumeCombobox({
  value,
  onChange,
  disabled,
  placeholder = "Select or enter volume...",
}: VolumeComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (option: VolumeOption) => {
    onChange(option.value);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="number"
        step="0.01"
        min="0"
        placeholder={placeholder}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          onChange(Number.isNaN(parsed) ? undefined : parsed);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur();
          }
          if (e.key === "Escape") {
            setIsOpen(false);
            inputRef.current?.blur();
          }
        }}
      />
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-60 overflow-auto">
          {VOLUME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                option.value === value && "bg-accent/50",
              )}
              // Prevent the input's onBlur from firing before this click is registered.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
