import * as React from "react";

import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {}

// Minimal styled native checkbox. Deliberately not a Radix primitive like the
// other `ui/` components: this is the app's only checkbox, and a plain `<input>`
// keeps native form/keyboard/screen-reader behaviour without adding a dependency.
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        className={cn(
          "h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
