import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive-solid text-destructive-foreground hover:bg-destructive-solid/80",
        // For a state to take seriously that is not yet a failure, sitting between
        // `outline` and `destructive` in weight. `secondary` cannot carry this: in dark
        // mode --secondary (16%) is three points off --card (13%), so the chip all but
        // disappears on the surface these statuses are always rendered on.
        warning:
          "border-transparent bg-warning text-warning-foreground hover:bg-warning/80",
        // The brand coral as a fill. Same job as `warning` - a state to take
        // seriously that is not yet a failure - but on the palette's own accent
        // rather than amber, for statuses that sit beside a `destructive` chip and
        // should read as the same family one step down. It separates from
        // `destructive` by lightness (65.7% against --destructive-solid's 40%), not
        // by hue: the two are six degrees apart and never could.
        coral:
          "border-transparent bg-coral text-coral-foreground hover:bg-coral/80",
        // The other brand accent, filled, for the settled end of a status scale
        // whose urgent end is `coral`. Teal is the dark half of the brand pair, so
        // unlike `coral` it carries a white label.
        teal: "border-transparent bg-teal text-teal-foreground hover:bg-teal/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
