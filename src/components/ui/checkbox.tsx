import * as React from "react";

import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {}

// The app's selection control: the invite queue's row and select-all boxes, and a
// contact's roles. Every boolean that is a *setting* is a `Switch` - see "Selection
// is a checkbox, and a setting is a switch" in DECISIONS.md for where the line
// falls.
//
// Deliberately not a Radix primitive like the other `ui/` components. A plain
// `<input>` keeps native form/keyboard/screen-reader behaviour without adding a
// dependency, and it is the shorter route to `indeterminate`, which the select-all
// needs and `role="switch"` cannot express at all.
//
// It takes `checked`/`onChange`, not Radix's `checked`/`onCheckedChange` - the two
// are not drop-in for one another.
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        className={cn(
          "h-4 w-4 shrink-0 rounded border-input accent-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
