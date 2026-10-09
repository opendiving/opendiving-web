"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DiveFormSectionProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Keeps the content mounted while collapsed, for a section whose state lives in its
  // component rather than in form state - the file import's note and its parse.
  keepMounted?: boolean;
  children: ReactNode;
}

// One of the dive form's field groups, a card of its own. The heading sticks under the
// site header while its card scrolls past, and the card being its containing block is
// what hands the spot to the next heading: this one leaves with its card's bottom edge.
//
// A collapsed section unmounts its fields, as a hidden field is not rendered - their
// values stay in form state (`shouldUnregister: false`) and are submitted all the same.
export function DiveFormSection({
  title,
  open,
  onOpenChange,
  keepMounted = false,
  children,
}: DiveFormSectionProps) {
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

  return (
    <Card className="relative">
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className="pointer-events-none absolute -top-(--header-height) h-px w-px"
      />
      {/* Squared off at the foot while open, so content scrolling under the stuck
          heading cannot show through its corners. Padded evenly rather than with
          the title's lift, which would leave the chevron off the heading's middle. A
          collapsed card is all heading, so it never sticks and takes no rule. */}
      <CardHeader
        className={cn(
          "sticky top-[var(--header-height)] z-10 rounded-t-lg bg-card pt-(--card-pad)",
          !open && "rounded-b-lg",
          // A shadow rather than a border: it takes no height, so the rule appearing
          // neither nudges the fields nor pulls the chevron off the middle.
          open && stuck && "shadow-[inset_0_-1px_0_hsl(var(--border))]",
        )}
      >
        <CardTitle as="h2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={contentId}
            onClick={() => onOpenChange(!open)}
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
      </CardHeader>
      <CardContent id={contentId} hidden={!open} className="space-y-6">
        {(open || keepMounted) && children}
      </CardContent>
    </Card>
  );
}
