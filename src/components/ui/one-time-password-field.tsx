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
>(({ className, ...props }, ref) => (
  <OneTimePasswordFieldPrimitive.Root
    ref={ref}
    className={cn("flex w-full items-center gap-2", className)}
    {...props}
  />
));
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
