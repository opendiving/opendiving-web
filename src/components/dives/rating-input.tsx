"use client";

import {
  useId,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { Star } from "lucide-react";
import type { FormControlSlotProps } from "@/components/ui/form";
import { RATING_MAX, RATING_MIN } from "@/lib/validations/dive";
import { cn } from "@/lib/utils";

const STEPS = Array.from(
  { length: RATING_MAX - RATING_MIN + 1 },
  (_, index) => RATING_MIN + index,
);

/** One step's name, which is what a screen reader reads for it. */
export function ratingStepLabel(step: number): string {
  return step === 1 ? "1 star" : `${step} stars`;
}

/** A stored rating as a sentence, for the places that show one. */
export function ratingSummary(rating: number): string {
  return `${rating} of ${RATING_MAX} stars`;
}

export interface RatingInputProps extends FormControlSlotProps {
  /** The step chosen, or `null` for unrated. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** The visible label's id - a group is named by reference, not by `for`. */
  "aria-labelledby"?: string;
  disabled?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The diver's rating of a dive as five stars, any one of which may be picked,
 * and none.
 *
 * **Native radios, hidden behind the stars.** A radio group is what a set of
 * mutually exclusive steps is, and the browser supplies its keyboard for free:
 * the group is one tab stop, the arrow keys move the step and pick it as they go,
 * and a screen reader announces the group's name, the step's and its position -
 * "4 stars, 4 of 5". Hand-rolled buttons with a roving tab index would rebuild all
 * of that and then have to be kept in step with it.
 *
 * **A radio cannot be unchecked, so clearing is two other things.** Backspace or
 * Delete on a focused star clears it, and `RatingLabelRow` puts a Clear button in
 * the label row for a pointer. Unrated is a real answer - `null`, not zero, and
 * what every dive logged before this field existed holds.
 */
export function RatingInput({
  value,
  onChange,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledBy,
  disabled,
  ref,
}: RatingInputProps) {
  // One group per control: a second rating on the page must not share its
  // radios' name, or the browser would treat the ten as one set.
  const name = useId();
  // The step under a mouse pointer, drawn as if picked so the diver sees what a
  // click would give. Touch has no hover, and a tap would leave one stuck.
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value;
  const hover = (step: number | null) => (event: PointerEvent) => {
    if (event.pointerType !== "touch" && !disabled) setHovered(step);
  };

  const clearOnKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Backspace" && event.key !== "Delete") return;
    event.preventDefault();
    onChange(null);
  };

  return (
    <div
      ref={ref}
      id={id}
      role="radiogroup"
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      // `h-10`, an input's height, so the field sits on its grid row like the
      // boxes beside it rather than a few pixels short of them.
      className="flex h-10 items-center gap-1"
      onPointerLeave={hover(null)}
    >
      {STEPS.map((step) => (
        <label
          key={step}
          className={cn(
            "relative flex h-8 w-8 items-center justify-center",
            disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
          )}
          onPointerEnter={hover(step)}
        >
          <input
            type="radio"
            name={name}
            value={step}
            checked={value === step}
            disabled={disabled}
            aria-label={ratingStepLabel(step)}
            onChange={() => onChange(step)}
            onKeyDown={clearOnKey}
            className="peer sr-only"
          />
          <Star
            aria-hidden
            className={cn(
              "h-6 w-6 rounded-sm peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
              shown !== null && step <= shown
                ? "fill-coral text-coral"
                : "text-muted-foreground",
            )}
          />
        </label>
      ))}
    </div>
  );
}

/**
 * The rating field's label row, with a Clear button parked at its right-hand end
 * while there is a rating to clear.
 *
 * Positioned rather than laid out, for `EntryUnitLabelRow`'s reason: a flex row
 * would blockify the `<label>` and let the button set the row's height, so this
 * field's stars would sit lower than the box beside them on the same grid row.
 * Out of flow, the button has no say in that, and the row is the line box a bare
 * label would give it.
 */
export function RatingLabelRow({
  children,
  canClear,
  onClear,
}: {
  children: ReactNode;
  canClear: boolean;
  onClear: () => void;
}) {
  return (
    // `mb-0` collects no margin a bare inline label would have dropped - see
    // `EntryUnitLabelRow`.
    <div className="relative mb-0">
      {children}
      {canClear && (
        <span className="absolute inset-y-0 right-0 flex items-center">
          <button
            // Inside the dive `<form>`, where a button's default type submits.
            type="button"
            onClick={onClear}
            // Contains the visible word, so a speech-input user can say it.
            aria-label="Clear rating"
            className="rounded px-1.5 py-0.5 text-xs leading-none text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * A stored rating drawn as stars, for reading, each the size of the text it
 * sits in. One image with one name rather than five, so a screen reader says
 * "4 of 5 stars" once.
 */
export function RatingStars({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={ratingSummary(rating)}
      className={cn("inline-flex items-center gap-[0.125em]", className)}
    >
      {STEPS.map((step) => (
        <Star
          key={step}
          aria-hidden
          className={cn(
            "size-[1em]",
            step <= rating ? "fill-coral text-coral" : "text-muted-foreground",
          )}
        />
      ))}
    </span>
  );
}
