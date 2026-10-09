"use client";

import { useId, type ReactNode } from "react";
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

  return (
    <Card>
      {/* Squared off at the foot while open, so content scrolling under the stuck
          heading cannot show through its corners. */}
      <CardHeader
        className={cn(
          "sticky top-[var(--header-height)] z-10 rounded-t-lg bg-card",
          !open && "rounded-b-lg",
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
