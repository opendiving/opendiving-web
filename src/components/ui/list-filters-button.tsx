"use client";

import { ChevronDown, Funnel, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ListFiltersButtonProps {
  /** The panel's id, which the button opens and shuts. */
  controls: string;
  isOpen: boolean;
  /** Fired with the state the press asks for. */
  onOpenChange: (open: boolean) => void;
  /** Puts every filter back to its opening state; fired as the panel shuts. */
  onClear: () => void;
  /** Whether a filter - the sort included - holds anything to lose. */
  isChanged: boolean;
  /** What the button does while shut, e.g. `Filter and sort dives`. */
  label: string;
  className?: string;
}

// The funnel a list card's header carries, folding the filter panel below it.
// Shutting the panel takes the filters with it, so a folded panel never narrows
// or reorders the list unseen, and the hint says so while there is something to
// lose.
export function ListFiltersButton({
  controls,
  isOpen,
  onOpenChange,
  onClear,
  isChanged,
  label,
  className,
}: ListFiltersButtonProps) {
  return (
    <IconTooltip
      label={
        !isOpen
          ? label
          : isChanged
            ? "Close filters, clearing them"
            : "Close filters"
      }
    >
      <Button
        variant="ghost"
        size="sm"
        className={cn("gap-1.5", className)}
        aria-expanded={isOpen}
        aria-controls={controls}
        onClick={() => {
          if (isOpen) onClear();
          onOpenChange(!isOpen);
        }}
      >
        <Funnel className="h-4 w-4" />
        {isOpen ? (
          <X className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </Button>
    </IconTooltip>
  );
}
