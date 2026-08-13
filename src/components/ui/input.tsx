import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

// Exported so the handful of native controls that can't be an `Input` - the role
// `<select>` in `dives/mixture-fields.tsx` - can sit on a form row beside one
// without their box drifting a few pixels taller or ringing differently on focus.
// Pass it alone when the control adds nothing of its own; fold additions in with
// `cn()` rather than concatenating, so a later utility wins the conflict the way it
// does for a caller's `className` on `Input` below.
export const inputClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputClassName, className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
