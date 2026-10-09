"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DiveFormSectionProps = {
  title: string;
  // Nothing in the content is visible, so it drops its padding and the card is all
  // heading. Its children stay mounted - a status region among them, say.
  empty?: boolean;
  children: ReactNode;
} & (
  | {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      action?: never;
      titleAdornment?: never;
    }
  | {
      // Takes the chevron's place, and the section no longer collapses.
      action: ReactNode;
      // Sits right after the title - an info popover, say.
      titleAdornment?: ReactNode;
      open?: never;
      onOpenChange?: never;
    }
);

// One of the dive form's field groups, a card of its own. The heading sticks under the
// site header while its card scrolls past, and the card being its containing block is
// what hands the spot to the next heading: this one leaves with its card's bottom edge.
//
// A collapsed section unmounts its fields, as a hidden field is not rendered - their
// values stay in form state (`shouldUnregister: false`) and are submitted all the same.
export function DiveFormSection(props: DiveFormSectionProps) {
  const { title, empty = false, children } = props;
  const open = props.onOpenChange === undefined || props.open;
  const contentId = useId();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  // The sentinel sits one header-height above the card, so it leaves the top of the
  // viewport exactly when the card's top passes under the site header - the moment
  // the heading starts sticking. Leaving at the bottom is not that, hence the side.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) =>
      setStuck(
        !entry.isIntersecting &&
          entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0),
      ),
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const shown = open && !empty;

  return (
    <Card className="relative">
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className="pointer-events-none absolute -top-(--header-height) h-px w-px"
      />
      {/* Squared off at the foot while content shows, so content scrolling under the
          stuck heading cannot show through its corners. Padded evenly rather than
          with the title's lift, which would leave the chevron off the heading's
          middle. A card that is all heading never sticks and takes no rule. */}
      <CardHeader
        className={cn(
          "sticky top-[var(--header-height)] z-10 rounded-t-lg bg-card pt-(--card-pad)",
          !shown && "rounded-b-lg",
          // A shadow rather than a border: it takes no height, so the rule appearing
          // neither nudges the fields nor pulls the chevron off the middle.
          shown && stuck && "shadow-[inset_0_-1px_0_hsl(var(--border))]",
        )}
      >
        {props.onOpenChange === undefined ? (
          <div className="flex items-center justify-between gap-2">
            <CardTitle as="h2" className="flex items-center gap-1">
              {title}
              {/* No height of its own: a touch screen's 44px floor would otherwise
                  stretch the title's line, and the box beyond its icon is invisible. */}
              <span className="flex h-0 items-center">
                {props.titleAdornment}
              </span>
            </CardTitle>
            {/* Overhangs the title's line into the heading's padding, so the heading
                is as tall as every other section's - on a touch screen nearly so,
                where the button's floor is 44px. */}
            <div className="-my-2">{props.action}</div>
          </div>
        ) : (
          <CardTitle as="h2">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={contentId}
              onClick={() => props.onOpenChange(!open)}
              className="relative flex w-full items-center justify-between gap-2 rounded-sm text-left touch:tap-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {title}
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                  !open && "-rotate-90",
                )}
              />
            </button>
          </CardTitle>
        )}
      </CardHeader>
      {/* The heading's even padding is `--card-pad`, which a phone halves; the rest of
          the first field's gap is made up here, so it sits as far below the heading as
          the fields sit from each other. */}
      <CardContent
        id={contentId}
        hidden={!open}
        className={cn(
          "space-y-6 pt-[calc(--spacing(6)-var(--card-pad))]",
          empty && "p-0",
        )}
      >
        {open && children}
      </CardContent>
    </Card>
  );
}
