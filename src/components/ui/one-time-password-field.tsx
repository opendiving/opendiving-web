"use client";

import * as React from "react";
import * as OneTimePasswordFieldPrimitive from "@radix-ui/react-one-time-password-field";

import { cn } from "@/lib/utils";

// One box per character of a short code, wired together by Radix: focus walks
// forward as digits land and back on Backspace, arrow keys move between boxes, a
// paste anywhere in the group fills all of them, and Enter submits the form the
// group sits in.
//
// The root renders a `role="group"`, not an input, so it has no label to point a
// `<Label htmlFor>` at - name it with `aria-labelledby` against whatever text
// introduces it. Each box carries its own "Character N of M" label from Radix.
const OneTimePasswordField = React.forwardRef<
  React.ElementRef<typeof OneTimePasswordFieldPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof OneTimePasswordFieldPrimitive.Root>
>(({ className, ...props }, ref) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => rootRef.current as HTMLDivElement);

  // A tap is left to focus its box natively. Radix cancels `pointerdown` and focuses
  // the box itself, and iOS raises no keyboard for that: a box already focused
  // stays keyboardless, and any other one gets the keyboard for an instant before
  // the tap ends and takes focus away again. Its roving focus also cancels the tap's
  // `mousedown` on a box past the code, and on iOS that `mousedown` is what focuses.
  // So a tap's events never reach either handler - stopped, not cancelled - and the
  // one rule they kept is kept here instead: a tap past the code typed so far lands
  // on the next empty box.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let tapped = false;
    const onPointerDown = (event: PointerEvent) => {
      tapped =
        event.pointerType === "touch" &&
        event.target instanceof HTMLInputElement;
      if (tapped) event.stopPropagation();
    };
    // On `click`, the tap's last event: iOS settles its own focus on the tapped box
    // after `focusin`, so a move made there is undone.
    const onClick = () => {
      if (!tapped) return;
      tapped = false;
      const boxes = [
        ...root.querySelectorAll<HTMLInputElement>(
          "input[data-radix-otp-input]",
        ),
      ];
      const typed = boxes.findIndex((box) => box.value === "");
      const next = typed === -1 ? boxes.length - 1 : typed;
      const focused = boxes.indexOf(document.activeElement as HTMLInputElement);
      if (focused > next) boxes[next]?.focus();
    };
    const onMouseDown = (event: MouseEvent) => {
      if (tapped) event.stopPropagation();
    };
    root.addEventListener("pointerdown", onPointerDown, { capture: true });
    root.addEventListener("mousedown", onMouseDown, { capture: true });
    root.addEventListener("click", onClick, { capture: true });
    return () => {
      root.removeEventListener("pointerdown", onPointerDown, { capture: true });
      root.removeEventListener("mousedown", onMouseDown, { capture: true });
      root.removeEventListener("click", onClick, { capture: true });
    };
  }, []);

  return (
    <OneTimePasswordFieldPrimitive.Root
      ref={rootRef}
      className={cn("flex w-full items-center gap-2", className)}
      {...props}
    />
  );
});
OneTimePasswordField.displayName = "OneTimePasswordField";

// `flex-1 min-w-0` rather than a fixed width: six 40px boxes plus their gaps
// overflow the sign-in card on a 320px phone, and letting them share the row
// instead means the group fits whatever it is dropped into.
const OneTimePasswordFieldInput = React.forwardRef<
  React.ElementRef<typeof OneTimePasswordFieldPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof OneTimePasswordFieldPrimitive.Input>
>(({ className, ...props }, ref) => (
  <OneTimePasswordFieldPrimitive.Input
    ref={ref}
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
