"use client";

import { Fragment, type ReactNode } from "react";
import {
  UNIT_SYSTEMS,
  unitLabel,
  unitWord,
  type EntryDimension,
  type UnitSystem,
} from "@/lib/units";
import { cn } from "@/lib/utils";

export interface EntryUnitToggleProps {
  /** Which measurement this governs, which is what decides the two labels. */
  dimension: EntryDimension;
  /** The system currently on, highlighted between the two. */
  entryUnits: UnitSystem;
  /** Flips to the other system. */
  onToggle: () => void;
}

/**
 * A two-segment switch for one dimension's *entry* units - "m | ft", "bar | psi".
 *
 * One `<button>` rather than two or a radiogroup: there are exactly two systems,
 * so pressing it can only mean "the other one", and a single control keeps the
 * form's tab order from growing a stop per unit. It sits beside a `FormLabel`
 * rather than inside one - interactive content in a `<label>` misroutes clicks -
 * and outside `FormControl`, so the field's own labelling is untouched and this
 * carries its own name as the secondary control of a composite field.
 *
 * That name has to *contain* the visible text before it names the action (WCAG
 * 2.5.3, Label in Name: a speech-input user says what they can see), which is
 * also the repo's own convention wherever an `aria-label` overrides visible text.
 */
export function EntryUnitToggle({
  dimension,
  entryUnits,
  onToggle,
}: EntryUnitToggleProps) {
  const next: UnitSystem = entryUnits === "metric" ? "imperial" : "metric";
  const visible = UNIT_SYSTEMS.map((system) =>
    unitLabel(dimension, system),
  ).join(" | ");

  return (
    <button
      // Explicit, because this renders inside the dive `<form>` where a button's
      // default type submits - the same guard the gear controls beside it carry.
      type="button"
      onClick={onToggle}
      aria-label={`${visible} — switch ${dimension} entry to ${unitWord(dimension, next)}`}
      // Inline rather than flex, and the separator carries its own spaces, so the
      // button's text content is the "m | ft" the `aria-label` above quotes -
      // a gap drawn in CSS would leave the two disagreeing about what is visible.
      className="inline-block rounded border px-1.5 py-0.5 text-xs leading-none text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {UNIT_SYSTEMS.map((system, index) => (
        <Fragment key={system}>
          {index > 0 && (
            <span className="text-muted-foreground/40">{" | "}</span>
          )}
          {/* The off system is `text-muted-foreground` at full strength, not the
              `/60` it was: `--muted-foreground` is picked to clear AA on both
              surfaces it lands on (see globals.css), and 60% of it is 12px text
              at roughly half that - axe flagged one per toggle, six per dive
              form. What separates the two halves is the weight and the
              foreground/muted split, which is the same pair the rest of the app
              uses for primary against secondary text; the opacity was only ever
              adding to a distinction that already carried on its own. */}
          <span
            className={cn(
              system === entryUnits
                ? "font-medium text-foreground"
                : "text-muted-foreground",
            )}
          >
            {unitLabel(dimension, system)}
          </span>
        </Fragment>
      ))}
    </button>
  );
}

/**
 * A field's label row with its unit toggle parked at the right-hand end.
 *
 * The toggle is positioned rather than laid out beside the label, and that is the
 * whole point of this component: **any flex or grid parent blockifies its
 * children**, and `FormLabel` is a `<label>`, which is `display: inline` by
 * default. Wrapping it in `flex items-center justify-between` therefore shrank its
 * box from the 17px inline content area to the 14px line box its `leading-none`
 * declares, while the 18px toggle became the row's height instead — so a field
 * with a toggle sat its input 2px lower and its label text 2px higher than the
 * field beside it in the same grid row. Measured on `Water type` / `Altitude`,
 * which are side by side, and identical on all five toggles in the dive form.
 *
 * Taking the toggle out of flow fixes both halves at once: the label stays inline
 * in an ordinary block, so the row is the same line box it always was and the text
 * keeps its baseline, and the toggle no longer has any say in the row's height. It
 * is centred on that line box, which is the same relationship to the label text it
 * had before. Nothing about the non-toggle fields changes, and nothing here needs
 * to know the toggle's height — which is what stops this drifting the next time
 * the control's padding moves.
 *
 * Not used by the Gas Mixtures header, where the toggle's only companion is an
 * `<h3>` - block-level already, so the flex row has nothing to blockify and the
 * alignment is right without any of this.
 */
export function EntryUnitLabelRow({
  children,
  ...toggle
}: EntryUnitToggleProps & { children: ReactNode }) {
  return (
    // `mb-0` is load-bearing, and the reason is worth stating because it looks
    // like a no-op. `FormItem` spaces its children with `space-y-2`, which is a
    // *margin-bottom* on every child but the last - and vertical margins have no
    // effect on an inline box, so a bare `FormLabel` silently drops it and its
    // input sits 3px under the text rather than 11px. Every form in the app looks
    // that way. Wrapping the label in anything block-level collects the 8px the
    // label was never given, which would push this field's input below its
    // neighbour's just as surely as the flex row did.
    <div className="relative mb-0">
      {children}
      {/* `inset-y-0` + `items-center` rather than a translate, so the toggle
          centres on whatever the label row turns out to be - including the two
          lines it becomes if the label wraps on a narrow viewport. */}
      <span className="absolute inset-y-0 right-0 flex items-center">
        <EntryUnitToggle {...toggle} />
      </span>
    </div>
  );
}
