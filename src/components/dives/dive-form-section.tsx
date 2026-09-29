"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiveFormSectionProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

// One of the dive form's field groups, headed the way the check-in page heads its
// sections. The heading sticks under the site header while its section scrolls past,
// and the section being its containing block is what hands the spot to the next
// heading: this one leaves with its section's bottom edge, which is where the next
// one starts.
//
// A collapsed section unmounts its fields, as a hidden field is not rendered - their
// values stay in form state (`shouldUnregister: false`) and are submitted all the same.
export function DiveFormSection({
  title,
  open,
  onOpenChange,
  children,
}: DiveFormSectionProps) {
  const contentId = useId();

  return (
    <section className="space-y-6">
      {/* Bled to the card's edges with its padding, so content scrolling under it
          is covered from border to border rather than showing either side. */}
      <h3 className="sticky top-[var(--header-height)] z-10 -mx-6 border-b bg-card px-6 max-sm:-mx-4 max-sm:px-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => onOpenChange(!open)}
          className="flex w-full items-center justify-between gap-2 py-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {title}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              !open && "-rotate-90",
            )}
          />
        </button>
      </h3>
      <div id={contentId} hidden={!open} className="space-y-6">
        {open && children}
      </div>
    </section>
  );
}
