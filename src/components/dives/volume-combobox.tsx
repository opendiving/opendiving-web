"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { nextActiveIndex } from "@/components/ui/creatable-combobox";
import { cn } from "@/lib/utils";
import type { FormControlSlotProps } from "@/components/ui/form";
import { useUnits } from "@/hooks/useUnits";
import type { UnitSystem } from "@/lib/units";

export interface VolumeOption {
  value: number;
  label: string;
  /**
   * The cu-ft name this cylinder is known by, where it has one.
   *
   * Only the US aluminum sizes carry one. `24 L (2x12 L)`'s parenthetical looks
   * like the same thing and is not - it is a metric composition, so it is part of
   * `label` and never leads.
   */
  imperialName?: string;
}

// Common cylinder water capacities (liters). Plain-metric entries are typical
// European steel/aluminum single/twin tanks; imperial-origin entries are
// common US aluminum cylinders, labeled with their familiar cu-ft-based size
// (e.g. "S80") alongside the actual liter water capacity, since that's how
// divers usually refer to them day to day.
export const VOLUME_OPTIONS: VolumeOption[] = [
  { value: 3, label: "3 L" },
  { value: 5, label: "5 L" },
  { value: 7.1, label: "7.1 L (S50)", imperialName: "S50" },
  { value: 9.2, label: "9.2 L (S63)", imperialName: "S63" },
  { value: 10, label: "10 L" },
  { value: 10.2, label: "10.2 L (S72)", imperialName: "S72" },
  { value: 11.1, label: "11.1 L (S80)", imperialName: "S80" },
  { value: 12, label: "12 L" },
  { value: 13.6, label: "13.6 L (S100)", imperialName: "S100" },
  { value: 15, label: "15 L" },
  { value: 18, label: "18 L" },
  { value: 20, label: "20 L" },
  { value: 22.2, label: "22.2 L (2x S80)", imperialName: "2x S80" },
  { value: 24, label: "24 L (2x12 L)" },
];

/**
 * How a preset is written for a diver reading in `units`.
 *
 * Imperial leads with the cu-ft name where there is one - "S80 (11.1 L)" rather
 * than "11.1 L (S80)" - and that relabel is the *whole* of what imperial mode does
 * to this field. The stored value stays litres in both systems, because a
 * cylinder's litres are its water capacity while its cubic feet are the gas it
 * holds at a rated pressure the mixture doesn't record: converting one to the other
 * needs a column that doesn't exist, and inventing a factor would be fake maths.
 * A preset with no cu-ft identity is the same string in both systems.
 */
export function volumeOptionLabel(
  option: VolumeOption,
  units: UnitSystem,
): string {
  if (units === "metric" || !option.imperialName) return option.label;
  return `${option.imperialName} (${option.value} L)`;
}

export interface VolumeComboboxProps extends FormControlSlotProps {
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
  ...slotProps
}: VolumeComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const units = useUnits();
  // Index of the keyboard-highlighted preset, or -1 for none - shares
  // `nextActiveIndex` with `CreatableCombobox` so both dropdowns in the dive
  // form move the same way.
  const [activeIndex, setActiveIndex] = useState(-1);
  // What is being typed, while it is being typed; `null` whenever the field is
  // showing `value` itself.
  //
  // This exists because the input is `type="text"` (see the `role` below for
  // why) and the committed value is a `number`, so without it the round trip
  // through `parseFloat` eats the keystroke that is mid-decimal: typing the "."
  // of "11.1" parses to `11`, which renders as "11", which deletes the "." the
  // diver just pressed and makes a decimal volume unenterable. `type="number"`
  // hid that - a browser reports `value === ""` for a half-typed "11." while
  // still *displaying* it - and it is the one behaviour of that type this field
  // was relying on.
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  useEffect(() => {
    if (activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const closeMenu = () => {
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleSelect = (option: VolumeOption) => {
    onChange(option.value);
    // Dropping the draft is what lets the picked preset reach the input at all:
    // it would otherwise keep rendering whatever half-typed query opened the
    // menu. Same on blur below, which is where "11." settles back to "11".
    setDraft(null);
    closeMenu();
  };

  return (
    <div className="relative">
      <Input
        {...slotProps}
        ref={inputRef}
        // `text` + `inputMode`, not `type="number"`. A number input's implicit
        // role is `spinbutton`, and ARIA does not allow `role="combobox"` on it -
        // axe reports `aria-allowed-role`, twice per dive form. Only text,
        // search, tel, url and email may carry the role, which is why
        // `CreatableCombobox` beside this one was already conforming.
        //
        // `inputMode="decimal"` keeps the numeric keypad on a phone, which is the
        // half of `type="number"` that was worth having here. The other half -
        // `step` and `min` - is gone with it and not missed: the arrow keys were
        // already taken over for the menu (see `onKeyDown`), and the real
        // constraint is `z.number().positive()` in the dive schema, not the
        // browser's.
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={draft ?? (value === undefined ? "" : String(value))}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const parsed = parseFloat(raw);
          onChange(Number.isNaN(parsed) ? undefined : parsed);
        }}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined
        }
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
        onBlur={() => {
          setDraft(null);
          closeMenu();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            // These navigate the preset list, so the caret doesn't get them:
            // `preventDefault` stops the jump to the start or end of the text.
            // Back when this was `type="number"` they natively stepped the value
            // by `step` (0.01), and taking them for the list was the deliberate
            // behaviour change recorded here - browsing the presets beats nudging
            // a volume by a hundredth of a litre. The keys still do the same
            // thing; only what they are being taken *from* has changed.
            e.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              return;
            }
            setActiveIndex((current) =>
              nextActiveIndex(
                current,
                e.key === "ArrowDown" ? 1 : -1,
                VOLUME_OPTIONS.length,
              ),
            );
            return;
          }

          if (e.key === "Enter") {
            e.preventDefault();
            if (isOpen && activeIndex >= 0) {
              handleSelect(VOLUME_OPTIONS[activeIndex]);
              return;
            }
            inputRef.current?.blur();
            return;
          }

          if (e.key === "Escape") {
            closeMenu();
            inputRef.current?.blur();
          }
        }}
      />
      {isOpen && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-60 overflow-auto"
        >
          {VOLUME_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              type="button"
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              ref={(el) => {
                optionRefs.current[index] = el;
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                option.value === value && "bg-accent/50",
                index === activeIndex && "bg-accent text-accent-foreground",
              )}
              // Prevent the input's onBlur from firing before this click is registered.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => handleSelect(option)}
            >
              {volumeOptionLabel(option, units)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
