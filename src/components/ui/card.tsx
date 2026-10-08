import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

// Each section pads `--card-pad` (`globals.css`), 12px on a phone.
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-(--card-pad)", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  // The heading level. `h3` suits a card sitting under a page section, which is most of
  // them; a page whose cards *are* its top-level sections passes `h2`, so the title fits
  // the page's heading order rather than jumping a level (axe's `heading-order`). Only
  // the tag changes - the size is carried by the classes, not by the level.
  as?: "h2" | "h3" | "h4";
}

const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as: Heading = "h3", ...props }, ref) => (
    <Heading
      ref={ref}
      className={cn(
        "text-2xl font-semibold leading-none tracking-tight max-sm:text-lg",
        className,
      )}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

// A title line that also holds a control. A `size="sm"` button is 36px against the
// title's 24px line - 18px on a phone - so centring the two let the button set the
// line's height and dropped the title below where a card without one has it.
// Top-aligned, with the control lifted by half the difference, the title stays put
// and the control stays centred on it; the row gap is that lift plus 12px, which keeps
// a control that wraps onto its own line 12px clear of the title.
const CARD_TITLE_ROW =
  "flex flex-wrap items-start justify-between gap-x-3 gap-y-4.5 max-sm:gap-y-5.25";
const CARD_TITLE_ACTION = "-mt-1.5 max-sm:-mt-2.25";

// The smaller title of a card that flags something above a page's main content, such
// as Home's notices, led by an `h-4 w-4` icon. A trailing count takes `ml-auto`.
const CARD_TITLE_SMALL = "flex items-center gap-2 text-base max-sm:text-base";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-(--card-pad) pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-(--card-pad) pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  CARD_TITLE_ACTION,
  CARD_TITLE_ROW,
  CARD_TITLE_SMALL,
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
