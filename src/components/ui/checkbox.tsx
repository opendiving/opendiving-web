import * as React from "react";

import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {}

// The app's selection control: a row, a select-all box, a pick among several
// values. Every boolean that is a *setting* is a `Switch` - see "Selection
// is a checkbox, and a setting is a switch" in DECISIONS.md for where the line
// falls.
//
// A native input supplies form, keyboard and screen-reader behavior, including
// the indeterminate state needed by select-all. It uses standard checked/onChange
// props, while settings use Switch's checked/onCheckedChange API.
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        className={cn(
          "h-4 w-4 shrink-0 rounded border-input accent-teal ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
