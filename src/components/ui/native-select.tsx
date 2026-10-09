import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { inputClassName } from "@/components/ui/input";

export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

// A plain `<select>` in the app's field box, drawing the app's own chevron over
// it: the UA arrow differs in shape and inset from browser to browser.
//
// The overlay rather than a `background-image`: the chevron is `currentColor`, and
// a data-URI SVG would have to name a hex, which is two hexes across the themes.
//
// The wrapper is a `grid` and not `relative` on purpose. Both children share one
// cell, so the chevron sits over the box without positioning, and a caller's own
// `absolute` adornment - the Waves icon on Water type - still paints above an
// in-flow wrapper. A positioned wrapper would come later in paint order and hide it.
const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="grid w-full">
      {/* Props land here, not on the wrapper: `FormControl`'s `Slot` passes its
      `id` and `aria-*` down through this component, and only a labelable element
      can carry them. */}
      <select
        ref={ref}
        className={cn(
          inputClassName,
          "col-start-1 row-start-1 appearance-none pr-9",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none col-start-1 row-start-1 mr-3 h-4 w-4 self-center justify-self-end opacity-50"
      />
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
