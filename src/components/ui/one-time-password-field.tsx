"use client";

import * as React from "react";
import { OTPField as OneTimePasswordFieldPrimitive } from "@base-ui/react/otp-field";
import type { AppComponentProps } from "./component-props";
import { setRef } from "./refs";
import { cn } from "@/lib/utils";

const OneTimePasswordField = React.forwardRef<
  HTMLDivElement,
  Omit<
    AppComponentProps<typeof OneTimePasswordFieldPrimitive.Root>,
    "length"
  > & {
    length?: number;
  }
>(({ className, length = 6, ...props }, ref) => {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let touching = false;
    const pointerDown = (event: PointerEvent) => {
      touching = event.pointerType === "touch";
    };
    // iOS must focus the input natively to keep its keyboard open.
    const mouseDown = (event: MouseEvent) => {
      if (touching) event.stopPropagation();
    };
    const focus = (event: FocusEvent) => {
      if (touching) event.stopPropagation();
    };
    const click = () => {
      if (!touching) return;
      touching = false;
      const inputs = Array.from(
        root.querySelectorAll<HTMLInputElement>("[data-otp-slot]"),
      );
      const empty = inputs.findIndex((input) => !input.value);
      const next = empty < 0 ? inputs.length - 1 : empty;
      const active = inputs.findIndex(
        (input) => input === document.activeElement,
      );
      if (active > next) inputs[next]?.focus();
    };
    root.addEventListener("pointerdown", pointerDown, true);
    root.addEventListener("mousedown", mouseDown, true);
    root.addEventListener("focusin", focus, true);
    root.addEventListener("click", click, true);
    return () => {
      root.removeEventListener("pointerdown", pointerDown, true);
      root.removeEventListener("mousedown", mouseDown, true);
      root.removeEventListener("focusin", focus, true);
      root.removeEventListener("click", click, true);
    };
  }, []);
  return (
    <OneTimePasswordFieldPrimitive.Root
      ref={(node) => {
        rootRef.current = node;
        setRef(ref, node);
      }}
      length={length}
      className={cn("flex w-full items-center gap-2", className)}
      {...props}
    />
  );
});
OneTimePasswordField.displayName = "OneTimePasswordField";

const OneTimePasswordFieldInput = React.forwardRef<
  React.ElementRef<typeof OneTimePasswordFieldPrimitive.Input>,
  AppComponentProps<typeof OneTimePasswordFieldPrimitive.Input> & {
    index?: number;
  }
>(({ className, index, ...props }, ref) => (
  <OneTimePasswordFieldPrimitive.Input
    ref={ref}
    data-otp-slot=""
    render={(props, state) => (
      <input
        {...props}
        aria-labelledby={undefined}
        aria-label={`Character ${(index ?? state.index) + 1} of ${state.length}`}
      />
    )}
    className={cn(
      "h-12 min-w-0 flex-1 rounded-md border border-input bg-background text-center text-lg font-medium tabular-nums ring-offset-background",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
OneTimePasswordFieldInput.displayName = "OneTimePasswordFieldInput";

export { OneTimePasswordField, OneTimePasswordFieldInput };
