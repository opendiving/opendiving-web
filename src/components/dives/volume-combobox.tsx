"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { nextActiveIndex } from "@/components/ui/creatable-combobox";
import {
  PickerSheet,
  pickerMenuClassName,
  usePickerSheet,
} from "@/components/ui/picker-sheet";
import { parseDecimal } from "@/lib/decimal-entry";
import { cn } from "@/lib/utils";
import type { FormControlA11yProps } from "@/components/ui/form";
import { useUnits } from "@/hooks/useUnits";
import type { UnitSystem } from "@/lib/units";
import { divesAPI } from "@/lib/api/dives";
import {
  VOLUME_GROUPS,
  type VolumeOption,
  type VolumeOptionGroup,
} from "@/lib/cylinder-presets";

/**
 * The groups in the order a diver reading in `units` sees them.
 *
 * The reader's own singles lead, the other family's follow, and the groups
 * belonging to neither sit at the bottom; nothing is dropped. That is the whole
 * of the difference, and it is deliberate that membership is not part of it. A
 * preset list filtered by unit system reads sensible and fails the one diver it
 * exists for: hand a metric diver an AL80 on a boat in Florida and the very
 * preset that tells them it holds 11.1 L is the one that has been hidden, and an
 * imperial diver handed a 12 L in Croatia is stuck the same way. The unfamiliar
 * half is the half worth showing - see DECISIONS.md.
 *
 * Grouping is what keeps the full list browsable, which is the job the split was
 * wrongly doing.
 */
function volumeGroupsFor(units: UnitSystem): VolumeOptionGroup[] {
  const families = VOLUME_GROUPS.filter((group) => group.system !== undefined);
  return [
    ...families.filter((group) => group.system === units),
    ...families.filter((group) => group.system !== units),
    ...VOLUME_GROUPS.filter((group) => group.system === undefined),
  ];
}

/**
 * How a preset is written for a diver reading in `units`.
 *
 * Imperial leads with the cu-ft name where there is one - "AL80 (11.1 L)" rather
 * than "11.1 L (AL80)". That relabel, and the order `volumeGroupsFor` puts the
 * groups in, are the whole of what the unit system does to this field - every
 * preset is offered either way. The stored value stays litres in
 * both systems, because a cylinder's litres are its water capacity while its cubic
 * feet are the gas it holds at a rated pressure the mixture doesn't record:
 * converting one to the other needs a column that doesn't exist, and inventing a
 * factor would be fake maths. That is also why the name has to carry the material -
 * an AL80 and an HP80 are the same "80 cubic feet" at 11.1 L and 10.2 L, so the
 * material is what pins a cu-ft name to a litre figure.
 * A preset with no cu-ft identity is the same string in both systems.
 */
function volumeOptionLabel(option: VolumeOption, units: UnitSystem): string {
  if (units === "metric" || !option.imperialName) return option.label;
  return `${option.imperialName} (${option.value} L)`;
}

export interface VolumeComboboxProps extends FormControlA11yProps {
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
  /**
   * Called with the row a diver picks, after `onChange` has its litres - never for
   * a typed number, which carries no name. Lets a gear item take the vessel facts
   * a named preset carries; a dive's cylinder records only the volume.
   */
  onPick?: (option: VolumeOption) => void;
  /** The dive's start time; bounds the "Recently used" group like a lookup's `until`. */
  until?: string;
  disabled?: boolean;
  /**
   * Shows `value` and takes no input: no typing, and no menu. A tank linked to a
   * vessel that records its capacity reads the figure off the vessel.
   */
  readOnly?: boolean;
  placeholder?: string;
}

// A combobox for picking a cylinder volume: click one of the common-size presets
// (every one of them, under group headings, never filtered - not by what's typed,
// and not by the diver's unit system either; `volumeGroupsFor` says why), or
// type/commit an arbitrary number (e.g. an odd steel tank, or a value filled in
// from a parsed dive-computer file - see `dive-file-import.tsx`) that isn't one of
// them. The input itself only ever shows the plain number, never a preset's label
// (e.g. "11.1", not "11.1 L (AL80)") - the label is just a hint shown in the
// dropdown to help pick the right preset.
//
// Deliberately a plain input + manually-rendered dropdown (mirroring
// `CreatableCombobox`'s approach) rather than a picker: a parsed volume usually
// matches no preset, and a plain controlled input always displays exactly what
// `value` holds.
export function VolumeCombobox({
  value,
  onChange,
  onPick,
  until,
  disabled,
  readOnly = false,
  placeholder = "Select or enter volume...",
  ...slotProps
}: VolumeComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const units = useUnits();
  // The diver's own recent volumes, fetched on each open so a dive saved in
  // another tab shows up. The last answer stays on screen while the next loads,
  // and a failed fetch keeps whatever it had - the presets work regardless.
  const [recentVolumes, setRecentVolumes] = useState<number[]>([]);
  const recentRef = useRef<number[]>([]);
  // Groups for rendering, and the flat list the keyboard walks. Headings are not
  // in `options` at all, which is what makes the arrow keys skip them - there is
  // no index for a heading to occupy, so `nextActiveIndex` cannot land on one.
  const groups = useMemo(() => {
    let next = 0;
    // Ahead of every preset group, nearest the box, and in addition to them: a
    // recent 11.1 is still listed under "US aluminium" as the AL80. Plain litres,
    // since a stored volume cannot say which of two same-sized presets it was.
    const recent: VolumeOptionGroup[] = recentVolumes.length
      ? [
          {
            label: "Recently used",
            options: recentVolumes.map((value) => ({
              value,
              label: `${value} L`,
            })),
          },
        ]
      : [];
    return [...recent, ...volumeGroupsFor(units)].map((group) => ({
      label: group.label,
      rows: group.options.map((option) => ({ option, index: next++ })),
    }));
  }, [units, recentVolumes]);
  const options = useMemo(
    () => groups.flatMap((group) => group.rows.map((row) => row.option)),
    [groups],
  );
  // Index of the keyboard-highlighted preset, or -1 for none - shares
  // `nextActiveIndex` with `CreatableCombobox` so both dropdowns in the dive
  // form move the same way.
  const [activeIndex, setActiveIndex] = useState(-1);
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    divesAPI
      .getRecentVolumes(until)
      .then((volumes) => {
        if (cancelled || volumes.join() === recentRef.current.join()) return;
        recentRef.current = volumes;
        setRecentVolumes(volumes);
        // The rows below shift by however much the group grew or shrank, so a
        // highlight would land on a different preset than the one chosen.
        setActiveIndex(-1);
      })
      .catch((error) =>
        console.error("Failed to fetch recent volumes:", error),
      );
    return () => {
      cancelled = true;
    };
  }, [isOpen, until]);
  // What is being typed, while it is being typed; `null` whenever the field is
  // showing `value` itself.
  //
  // This exists because the input is `type="text"` (see the `role` below for
  // why) and the committed value is a `number`, so without it the round trip
  // through `parseDecimal` eats the keystroke that is mid-decimal: typing the "."
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
  const sheet = usePickerSheet(inputRef, isOpen);

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
    onPick?.(option);
    // Dropping the draft is what lets the picked preset reach the input at all:
    // it would otherwise keep rendering whatever half-typed query opened the
    // menu. Same on blur below, which is where "11." settles back to "11".
    setDraft(null);
    closeMenu();
    // Out of the sheet without the keyboard, as `CreatableCombobox` leaves it.
    if (sheet) inputRef.current?.blur();
  };

  return (
    <PickerSheet
      sheet={sheet}
      onDone={() => inputRef.current?.blur()}
      field={
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
          readOnly={readOnly}
          onChange={(e) => {
            if (readOnly) return;
            const raw = e.target.value;
            setDraft(raw);
            const parsed = parseDecimal(raw);
            onChange(Number.isNaN(parsed) ? "" : parsed);
          }}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-activedescendant={
            isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          onFocus={() => setIsOpen(!readOnly)}
          onClick={() => setIsOpen(!readOnly)}
          onBlur={() => {
            setDraft(null);
            closeMenu();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              // These navigate the preset list, so the caret doesn't get them:
              // `preventDefault` stops the jump to the start or end of the text.
              // Browsing the presets beats nudging a volume by a hundredth of
              // a litre, so the keys never step the value either.
              e.preventDefault();
              if (readOnly) return;
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
      }
      menu={
        isOpen && (
          <div
            id={listId}
            role="listbox"
            className={pickerMenuClassName(sheet)}
          >
            {groups.map((group) => (
              // `role="group"` named by `aria-label` rather than by pointing at the
              // heading element: a listbox may own `group`s, and a group may own
              // `option`s, but a bare heading node between them is neither. Hiding
              // it keeps the accessible tree to listbox > group > option while the
              // heading stays on screen, where the whole point of it is.
              <div key={group.label} role="group" aria-label={group.label}>
                <div
                  aria-hidden="true"
                  className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground"
                >
                  {group.label}
                </div>
                {group.rows.map(({ option, index }) => (
                  <button
                    // Keyed by label, not value: the HP117 and the LP95 are both
                    // 15 L, and two rows keyed alike is a React warning and a
                    // re-order bug. Labels are unique across the table; values are
                    // not.
                    key={option.label}
                    type="button"
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    ref={(el) => {
                      optionRefs.current[index] = el;
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 touch:py-3 text-sm hover:bg-accent hover:text-accent-foreground",
                      // Tints every row holding the committed value, so 15 L lights
                      // up both the HP117 and the LP95. Correct rather than sloppy:
                      // the mixture records litres and cannot tell those two apart.
                      option.value === value && "bg-accent/50",
                      index === activeIndex &&
                        "bg-accent text-accent-foreground",
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
            ))}
          </div>
        )
      }
    />
  );
}
