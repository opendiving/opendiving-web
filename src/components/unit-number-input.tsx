"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  displayBound,
  displayNumber,
  isIntegerDimension,
  toCommittedMetric,
  type EntryDimension,
  type UnitSystem,
} from "@/lib/units";

export interface UnitNumberInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "min" | "max" | "type" | "placeholder"
> {
  /** Which measurement this box holds, which is what decides its unit and its parsing. */
  dimension: EntryDimension;
  /** The system the diver is typing in. */
  units: UnitSystem;
  /** The **metric** value held in form state, or this field's cleared sentinel. */
  value: number | null | "" | undefined;
  /** Emits the **metric** value, or `emptyValue` when the box is cleared. */
  onChange: (value: number | null | "") => void;
  /**
   * What "cleared" is spelled as for this field.
   *
   * Both sentinels are real and in use: every dive and gear scalar clears to `null`,
   * while the two mixture pressures clear to `""` (see DECISIONS.md - the rule is
   * anti-`undefined`, not `""`-everywhere, because react-hook-form re-displays a
   * field's default the moment its value resolves to `undefined`). A component that
   * only spoke one of them would silently change what the other's form submits.
   */
  emptyValue?: null | "";
  /** Native lower bound, declared in **metric** and converted for display. */
  min?: number;
  /** Native upper bound, declared in **metric** and converted for display. */
  max?: number;
  /** A **metric** example value; rendered as "e.g. …" in whichever system is on. */
  placeholderValue?: number;
}

/**
 * A number box that shows and accepts one measurement in the diver's own units,
 * while the value it reads and writes stays metric.
 *
 * This is one of the two edges where units convert at all - the formatters in
 * `lib/units.ts` are the other. Everything upstream of this box is metric: the form
 * state, the Zod schema validating it, the live MOD/END/EAD maths reading it, the
 * prefill that seeds it and the request that submits it. None of them know which
 * system the diver picked, which is the point: a conversion can only be forgotten in
 * a place that has to remember it.
 *
 * Renders the `<input>` and nothing else, so the callers' `<div className="relative">`
 * icon wrappers and their `FormControl` placement inside them are untouched - and so
 * the id and `aria-*` that `FormControl`'s `Slot` hands down land on a labelable
 * element rather than on a wrapper (DECISIONS.md, "`FormControl` only labels what it
 * can reach").
 */
export const UnitNumberInput = React.forwardRef<
  HTMLInputElement,
  UnitNumberInputProps
>(function UnitNumberInput(
  {
    dimension,
    units,
    value,
    onChange,
    emptyValue = null,
    min,
    max,
    placeholderValue,
    step,
    onBlur,
    ...props
  },
  ref,
) {
  // What the diver has actually typed, while they are typing it.
  //
  // Without it, every keystroke would put the *committed* value straight back under
  // the cursor: 50 ft commits 15 m, and 15 m is 49 ft, so the "0" of "50" would turn
  // into a "9" as it was typed. The same happens in metric the moment entry rounding
  // bites - "30.526" would become "30.53" mid-word. `null` means "nothing in
  // progress, show the value", and blur is where the correction belongs.
  //
  // Nothing watching `value` may reset this, deliberately - blur is where that
  // correction belongs. An effect resetting the draft whenever `value` changed
  // would fire on every keystroke - this box commits on each one, so it causes
  // most of the `value` changes it would be watching - and that is precisely the
  // reformat-under-the-cursor it exists to stop. Telling a self-made change from
  // an external one needs the last committed value tracked as well, and nothing
  // needs it yet: every path that writes one of these fields programmatically
  // (loading a gear set, applying a parsed file, seeding the edit form) runs from
  // a click or a mount, both of which blur the box first.
  //
  // The `units` prop is the one other reset, and it is a different question - see
  // just below.
  const [draft, setDraft] = React.useState<string | null>(null);

  // The one exception, and it is not `value` changing but `units` changing.
  //
  // A units flip has to discard the draft: what is under the cursor was typed in
  // the old system, and leaving it there shows a psi number under a bar label,
  // with the next keystroke committing it through the new units. Blur cannot be
  // relied on to do this - on macOS Safari and Firefox, clicking a `<button>`
  // does not move focus, so the box holding the draft is never blurred. jsdom's
  // `userEvent.click` *does* focus, which is why this needs its own test rather
  // than a click-the-toggle one: that would pass with this guard deleted.
  //
  // Adjusting state during render, comparing against the previous prop, rather
  // than in an effect: React documents this shape for exactly this case, it
  // re-renders before anything is painted, and the effect form is a lint error
  // here (`react-hooks/set-state-in-effect`).
  const [previousUnits, setPreviousUnits] = React.useState(units);
  if (previousUnits !== units) {
    setPreviousUnits(units);
    setDraft(null);
  }

  const isEmpty = value == null || value === "";
  const displayed =
    draft ??
    (isEmpty
      ? ""
      : // Metric passes straight through, exactly as this box has always
        // rendered it: a value imported at three decimals stays legible as the
        // three decimals it is until the diver edits it. Imperial is a converted
        // number and has to be rounded to be typeable at all.
        units === "imperial"
        ? displayNumber(value as number, dimension, units)
        : String(value));

  const commit = (raw: string) => {
    setDraft(raw);

    const typed = isIntegerDimension(dimension)
      ? parseInt(raw, 10)
      : parseFloat(raw);
    if (Number.isNaN(typed)) {
      onChange(emptyValue);
      return;
    }

    onChange(toCommittedMetric(typed, dimension, units));
  };

  return (
    <Input
      ref={ref}
      type="number"
      // Whole imperial units, because that is what the box displays: a diver
      // stepping a depth in feet gets 99, 100, 101, not 99.99. Metric keeps
      // whatever the caller declared, which is the API's own precision.
      step={units === "imperial" ? 1 : step}
      min={min == null ? undefined : displayBound(min, dimension, units, "min")}
      max={max == null ? undefined : displayBound(max, dimension, units, "max")}
      placeholder={
        placeholderValue == null
          ? undefined
          : `e.g. ${
              units === "imperial"
                ? displayNumber(placeholderValue, dimension, units)
                : placeholderValue
            }`
      }
      value={displayed}
      onChange={(e) => commit(e.target.value)}
      onBlur={(e) => {
        // Hand the box back to the formatter, so a committed 29.87 m re-renders
        // as the 98 ft it is rather than as whatever got it there.
        setDraft(null);
        onBlur?.(e);
      }}
      {...props}
    />
  );
});
