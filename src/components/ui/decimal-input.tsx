"use client";

import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { decimalEntryMessage, parseDecimal } from "@/lib/decimal-entry";

export interface DecimalInputProps extends Omit<
  InputProps,
  "type" | "value" | "onChange" | "min" | "max" | "step"
> {
  /** The number held, or `""` for an empty box. */
  value: number | "" | null | undefined;
  /** The number typed, or `""` when the box is empty or holds no number. */
  onValueChange: (value: number | "") => void;
  /** The least it may hold - zero or more, or a finger would need a minus key. */
  min: number;
  max?: number;
}

/**
 * A box for a plain decimal that cannot go below zero - a percentage, say.
 *
 * A mouse gets `<input type="number" step="any">`. A finger gets text on a decimal
 * keypad, read with either separator, its bounds reported as its own validity -
 * see "A finger types numbers on a keypad, with either separator" in DECISIONS.md.
 * That text is held while it is typed, so "32," does not lose its comma to the 32
 * it parses as, and goes back to the number on blur.
 */
export const DecimalInput = React.forwardRef<
  HTMLInputElement,
  DecimalInputProps
>(function DecimalInput(
  { value, onValueChange, min, max, onBlur, ...props },
  ref,
) {
  const keypad = useCoarsePointer() && min >= 0;
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : String(value));

  const validity = keypad ? decimalEntryMessage(shown, min, max) : "";
  React.useLayoutEffect(() => {
    inputRef.current?.setCustomValidity(validity);
  }, [validity]);

  if (keypad) {
    return (
      <Input
        ref={setRefs}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={shown}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const parsed = parseDecimal(raw);
          onValueChange(Number.isNaN(parsed) ? "" : parsed);
        }}
        onBlur={(e) => {
          setDraft(null);
          onBlur?.(e);
        }}
        {...props}
      />
    );
  }

  return (
    <Input
      ref={setRefs}
      type="number"
      step="any"
      min={min}
      max={max}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        onValueChange(raw === "" ? "" : parseFloat(raw));
      }}
      onBlur={onBlur}
      {...props}
    />
  );
});
