"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
   * Only the US sizes carry one, and it always states the material: `AL` for
   * aluminium, `HP` and `LP` for the two steel working-pressure families.
   * `24 L (2x12 L)`'s parenthetical looks like the same thing and is not - it is
   * a metric composition, so it is part of `label` and never leads.
   */
  imperialName?: string;
  /**
   * The one unit system this preset is offered in, or omitted for a preset
   * offered in both - see `volumeOptionsFor`.
   *
   * The AL40, the AL80 and the twin AL80 are the three offered in both. They are
   * what a metric diver meets on a rental boat abroad, and the twin for the same
   * reason as the single - a set of them is what the same boat hands a diver
   * doing two dives on one fill. The rest of the US list is noise to a metric
   * diver, exactly as the European sizes are noise to a US one.
   */
  showIn?: UnitSystem;
}

// Common cylinder water capacities (litres), ascending, with both systems'
// presets in one table that `volumeOptionsFor` splits. The unnamed entries are
// the typical European steel/aluminium singles and twins; the named ones are the
// US sizes, carrying the name divers actually say alongside the litre water
// capacity the mixture stores.
//
// The name states the material because the litres depend on it: an AL80 at
// 3000 psi is 11.1 L and a steel HP80 at 3442 psi is 10.2 L, and both are "80
// cubic feet". `AL` is aluminium - Luxfer and Catalina model-number that line
// `S80`, an `S` divers read as steel, which is why the model number is not what
// is shown here (see DECISIONS.md). `HP` is the 3442 psi steel family and `LP`
// the 2400/2640 psi one, from Faber and Worthington.
//
// Every litre figure is a manufacturer's stated water capacity - Luxfer's and
// Catalina's scuba sheets via XS Scuba, XS Scuba's Metal Impact sheet, Faber's
// and Worthington's own - never a number derived from the cu-ft name. The two
// sizes where makers disagree enough to matter say so below.
export const VOLUME_OPTIONS: VolumeOption[] = [
  { value: 3, label: "3 L", showIn: "metric" },
  { value: 5, label: "5 L", showIn: "metric" },
  // The stage/deco/pony bottle, and common enough on a rental boat to be worth
  // offering a metric diver too. Luxfer 5.7, Catalina 5.8.
  { value: 5.7, label: "5.7 L (AL40)", imperialName: "AL40" },
  { value: 7, label: "7 L", showIn: "metric" },
  {
    value: 7.1,
    label: "7.1 L (AL50)",
    imperialName: "AL50",
    showIn: "imperial",
  },
  { value: 9, label: "9 L (AL63)", imperialName: "AL63", showIn: "imperial" },
  { value: 10, label: "10 L", showIn: "metric" },
  { value: 10, label: "10 L (AL72)", imperialName: "AL72", showIn: "imperial" },
  {
    value: 10.2,
    label: "10.2 L (HP80)",
    imperialName: "HP80",
    showIn: "imperial",
  },
  { value: 11.1, label: "11.1 L (AL80)", imperialName: "AL80" },
  { value: 12, label: "12 L", showIn: "metric" },
  // The one size the makers genuinely disagree on: Faber 12.9, Worthington's own
  // sheet 11.6, PST 12.7. Faber's figure is the preset because it is the one most
  // often sold under the name; a diver holding either of the others types theirs.
  {
    value: 12.9,
    label: "12.9 L (HP100)",
    imperialName: "HP100",
    showIn: "imperial",
  },
  { value: 13, label: "13 L (LP85)", imperialName: "LP85", showIn: "imperial" },
  {
    value: 13.2,
    label: "13.2 L (AL100)",
    imperialName: "AL100",
    showIn: "imperial",
  },
  { value: 14, label: "14 L (2x7 L)", showIn: "metric" },
  { value: 15, label: "15 L", showIn: "metric" },
  // Two different cylinders at the same water capacity, which is the honest state
  // of affairs rather than a duplicate: the HP117 and the LP95 really are both
  // 15 L, and the mixture records the litres without the pressure that separates
  // them. Hence `key={option.label}` below - the value is not unique.
  {
    value: 15,
    label: "15 L (HP117)",
    imperialName: "HP117",
    showIn: "imperial",
  },
  { value: 15, label: "15 L (LP95)", imperialName: "LP95", showIn: "imperial" },
  {
    value: 15.3,
    label: "15.3 L (HP120)",
    imperialName: "HP120",
    showIn: "imperial",
  },
  // Worthington's X8-130. Faber has no 130; its nearest is the HP133 at 17 L,
  // which is a different cylinder rather than a second figure for this one.
  {
    value: 16,
    label: "16 L (HP130)",
    imperialName: "HP130",
    showIn: "imperial",
  },
  {
    value: 17,
    label: "17 L (LP108)",
    imperialName: "LP108",
    showIn: "imperial",
  },
  { value: 18, label: "18 L", showIn: "metric" },
  {
    value: 19,
    label: "19 L (LP121)",
    imperialName: "LP121",
    showIn: "imperial",
  },
  { value: 20, label: "20 L", showIn: "metric" },
  { value: 22.2, label: "22.2 L (2x AL80)", imperialName: "2x AL80" },
  { value: 24, label: "24 L (2x12 L)", showIn: "metric" },
  { value: 30, label: "30 L (2x15 L)", showIn: "metric" },
];

/**
 * The presets offered to a diver reading in `units`.
 *
 * Each system lands around fifteen entries, which is what keeps the dropdown
 * browsable with no filter at all (see the note on `VolumeCombobox`). Unsplit the
 * table is nearly thirty, and most of it is noise to whichever half of the world
 * does not use it - four LP steels mean nothing to a metric diver, and a 2x7 L
 * twinset nothing to a US one.
 *
 * Membership is all this decides. The stored value is litres in both systems, and
 * any number at all can still be typed, so a preset missing from a diver's list
 * costs them the click and nothing else.
 */
export function volumeOptionsFor(units: UnitSystem): VolumeOption[] {
  return VOLUME_OPTIONS.filter(
    (option) => option.showIn === undefined || option.showIn === units,
  );
}

/**
 * How a preset is written for a diver reading in `units`.
 *
 * Imperial leads with the cu-ft name where there is one - "AL80 (11.1 L)" rather
 * than "11.1 L (AL80)". This relabel and `volumeOptionsFor`'s membership are the
 * whole of what imperial mode does to this field. The stored value stays litres in
 * both systems, because a cylinder's litres are its water capacity while its cubic
 * feet are the gas it holds at a rated pressure the mixture doesn't record:
 * converting one to the other needs a column that doesn't exist, and inventing a
 * factor would be fake maths. That is also why the name has to carry the material -
 * an AL80 and an HP80 are the same "80 cubic feet" at 11.1 L and 10.2 L, so the
 * material is what pins a cu-ft name to a litre figure.
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
  /** Litres, or `""` for a cylinder whose size was never recorded. */
  value?: number | "";
  /**
   * Emits `""` when the box is cleared, never `undefined`.
   *
   * `""` is what this form spells cleared as, for the reason `diveMixtureSchema`
   * gives: react-hook-form re-displays a field's default the moment its value
   * resolves to `undefined`, so an emptied box would fill itself back in. The two
   * mixture pressures beside this one already work this way; this field joined them
   * when a cylinder became able to record a mix with no vessel.
   *
   * Unlike `UnitNumberInput`, the sentinel is fixed rather than a prop: the mixture
   * volume is the only field this combobox serves, and a `null`-clearing caller
   * would be a caller that does not exist.
   */
  onChange: (value: number | "") => void;
  disabled?: boolean;
  placeholder?: string;
}

// A combobox for picking a cylinder volume: click one of the common-size
// presets for this diver's unit system (`volumeOptionsFor` - always shown in
// full, not filtered by what's typed, there being few enough per system that
// filtering just makes it harder to browse them all), or type/commit an
// arbitrary number (e.g. an odd steel tank, or a value filled in from a parsed
// dive-computer file - see `dive-file-import.tsx`) that isn't one of them. The
// input itself only ever shows the plain number, never a preset's label (e.g.
// "11.1", not "11.1 L (AL80)") - the label is just a hint shown in the dropdown
// to help pick the right preset.
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
  const options = useMemo(() => volumeOptionsFor(units), [units]);
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
        value={draft ?? (typeof value === "number" ? String(value) : "")}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const parsed = parseFloat(raw);
          onChange(Number.isNaN(parsed) ? "" : parsed);
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
                options.length,
              ),
            );
            return;
          }

          if (e.key === "Enter") {
            e.preventDefault();
            if (isOpen && activeIndex >= 0) {
              handleSelect(options[activeIndex]);
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
          {options.map((option, index) => (
            <button
              // Keyed by label, not value: the HP117 and the LP95 are both 15 L,
              // and two rows keyed alike is a React warning and a re-order bug.
              // Labels are unique across the table; values are not.
              key={option.label}
              type="button"
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              ref={(el) => {
                optionRefs.current[index] = el;
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                // Tints every row holding the committed value, so 15 L lights up
                // both the HP117 and the LP95. Correct rather than sloppy: the
                // mixture records litres and cannot tell those two apart.
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
