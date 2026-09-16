import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { inputClassName } from "@/components/ui/input";

export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

// A plain `<select>` in the app's field box, drawing the same chevron the shadcn
// `SelectTrigger` does. The handful of pickers that need `""` as a real option
// (DECISIONS.md, "A dive-level select carries the same three states") cannot be a
// Radix `Select`, and the UA's own arrow sits further right and in a different
// shape than the Radix one - so a row mixing the two, like the dive form's Water
// type beside its UTC offset, shows two arrows at two insets unless this draws
// the second one.
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
      {/* 13px, not `mr-3`: the Radix trigger's chevron is a flex child inside
      `px-3` *and* a 1px border, so 12px here would miss it by the border. */}
      <ChevronDown
        aria-hidden
        className="pointer-events-none col-start-1 row-start-1 mr-[13px] h-4 w-4 self-center justify-self-end opacity-50"
      />
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
