import * as React from "react";

import { cn } from "@/lib/utils";

interface ProgressProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "role" | "children"
> {
  /** How far along the task is, in whatever unit `max` is in. */
  value: number;
  /** The whole of the task; the start is always zero. */
  max: number;
  /** What a screen reader says for the value, in place of the bare number. */
  valueText?: string;
}

/**
 * How far along a task is - an upload's bytes sent against its total - which is
 * why its role is `progressbar` and not the `meter` beside it.
 *
 * shadcn's `progress`, drawn as the registry draws it - a full-width indicator
 * moved into place - without the Radix primitive under it, which this repo
 * does not depend on and which would add only the role.
 */
export function Progress({
  value,
  max,
  valueText,
  className,
  ...props
}: ProgressProps) {
  const shown = Math.min(Math.max(value, 0), max);
  const fraction = max > 0 ? shown / max : 0;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={shown}
      aria-valuetext={valueText}
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className,
      )}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-transform"
        style={{ transform: `translateX(-${100 - fraction * 100}%)` }}
      />
    </div>
  );
}
