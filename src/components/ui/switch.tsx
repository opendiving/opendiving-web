"use client";

import * as React from "react";
import * as SwitchPrimitive from "./primitives/switch";
import type { AppComponentProps } from "./component-props";

import { cn } from "@/lib/utils";

// Boolean settings use a button so toggling one never submits its surrounding form.
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Switch>,
  AppComponentProps<typeof SwitchPrimitive.Switch>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Switch
    render={<button type="button" />}
    nativeButton
    ref={ref}
    className={cn(
      "peer relative inline-flex data-[size=default]:h-5 data-[size=default]:w-9 shrink-0 cursor-pointer touch:tap-target items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-teal data-[unchecked]:bg-muted-foreground",
      className,
    )}
    {...props}
  />
));
Switch.displayName = "Switch";

export { Switch };
