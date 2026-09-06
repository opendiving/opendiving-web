"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

// Every boolean *setting* in the app. A switch has no native element, so
// `role="switch"` with its checked state, keyboard handling and disabled semantics is
// the whole of what Radix buys here. `Root` renders `<button type="button">`, which is
// the guard every control on a card whose content is a `<form>` needs anyway.
//
// `ui/checkbox.tsx` is the other half, and only the other half: the invite queue's
// selection boxes, where rows are picked for a batch rather than left flipped. See
// "The invite queue selects with checkboxes, and everything else is a switch" in
// `DECISIONS.md`. The two are not drop-in for one another - this one takes
// `checked`/`onCheckedChange`, that one `checked`/`onChange`.
//
// On is `bg-teal` and not shadcn's `bg-primary`, for the reason `map-picker.tsx` and
// `locations-map.tsx` already carry: `--primary` is near-black in light and mid-grey in
// dark, so an accent-free on state would read as another shade of off. Teal is the
// accent the settled state gets here - the same fill the calendar's selected day and
// the default button take. Off is `bg-muted-foreground` rather than shadcn's `bg-input`
// because `--input` and `--background` are 9% apart in dark and 9% apart in light: the
// `bg-background` thumb would sit on a track it barely separates from, and the position
// of the thumb is half of what a switch says.
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-teal data-[state=unchecked]:bg-muted-foreground",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
