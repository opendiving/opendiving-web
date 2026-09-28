import * as React from "react";

import { cn } from "@/lib/utils";

interface MeterProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "role" | "children"> {
  /** The measured amount, in whatever unit `max` is in. */
  value: number;
  /** The top of the range; the bottom is always zero. */
  max: number;
  /** What a screen reader says for the value, in place of the bare number. */
  valueText?: string;
}

/**
 * A horizontal bar showing an amount against a fixed range - how full
 * something is, not how far along a task is, which is why its role is `meter`
 * and not `progressbar`.
 *
 * A value past `max` fills the bar and is exposed as `max`, since ARIA keeps a
 * meter's value inside its range; `valueText` is where the real figure goes.
 * A native `<meter>` would carry the role for free, but its bar is drawn by
 * vendor pseudo-elements no theme token reaches.
 */
export function Meter({
  value,
  max,
  valueText,
  className,
  ...props
}: MeterProps) {
  const shown = Math.min(Math.max(value, 0), max);
  const fraction = max > 0 ? shown / max : 0;

  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={shown}
      aria-valuetext={valueText}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      <div
        data-slot="meter-fill"
        className="h-full bg-primary"
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}
