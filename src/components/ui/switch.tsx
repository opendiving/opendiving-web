"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import type { PrimitiveProps } from "./slot";

import { cn } from "@/lib/utils";

// Boolean settings use a button so toggling one never submits its surrounding form.
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  PrimitiveProps<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    render={<button type="button" />}
    nativeButton
    ref={ref}
    className={cn(
      "peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer touch:tap-target items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-teal data-[unchecked]:bg-muted-foreground",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[checked]:translate-x-4 data-[unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
